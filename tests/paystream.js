const anchor = require("@coral-xyz/anchor");
const { SystemProgram, PublicKey } = anchor.web3;
const { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo, getAccount } = require("@solana/spl-token");
const { assert } = require("chai");

describe("paystream", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.paystream;

  let mint = null;
  let payerTokenAccount = null;
  let hostTokenAccount = null;
  let authorityTokenAccount = null;
  let claimerTokenAccount = null;

  const payer = anchor.web3.Keypair.generate();
  const host = anchor.web3.Keypair.generate();
  const authority = anchor.web3.Keypair.generate();
  const claimer = anchor.web3.Keypair.generate();

  const rate = new anchor.BN(10);
  const streamAmount = new anchor.BN(1000);
  const bountyAmount = new anchor.BN(500);

  before(async () => {
    // Airdrop SOL to payer, authority, host, claimer
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: await provider.connection.requestAirdrop(payer.publicKey, 10000000000)
    });
    await provider.connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: await provider.connection.requestAirdrop(authority.publicKey, 10000000000)
    });
    await provider.connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: await provider.connection.requestAirdrop(host.publicKey, 10000000000)
    });
    await provider.connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: await provider.connection.requestAirdrop(claimer.publicKey, 10000000000)
    });

    // Create Mint
    // keypair defaults to undefined which is fine, generates new
    mint = await createMint(
      provider.connection,
      payer, // payer
      payer.publicKey, // mintAuthority
      null, // freezeAuthority
      9 // decimals
    );

    // Create Token Accounts
    payerTokenAccount = await createAccount(provider.connection, payer, mint, payer.publicKey);
    hostTokenAccount = await createAccount(provider.connection, host, mint, host.publicKey);
    authorityTokenAccount = await createAccount(provider.connection, authority, mint, authority.publicKey);
    claimerTokenAccount = await createAccount(provider.connection, claimer, mint, claimer.publicKey);

    // Mint tokens to payer and authority
    await mintTo(provider.connection, payer, mint, payerTokenAccount, payer.publicKey, 2000);
    await mintTo(provider.connection, payer, mint, authorityTokenAccount, payer.publicKey, 1000);
  });

  it("Initializes a stream", async () => {
    const [sessionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("session"), payer.publicKey.toBuffer(), host.publicKey.toBuffer()],
      program.programId
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), sessionPda.toBuffer()],
        program.programId
    );

    await program.methods
      .initializeStream(rate, streamAmount)
      .accounts({
        session: sessionPda,
        vault: vaultPda,
        payer: payer.publicKey,
        host: host.publicKey,
        mint: mint,
        payerToken: payerTokenAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([payer])
      .rpc();

    const sessionAccount = await program.account.streamSession.fetch(sessionPda);
    assert.ok(sessionAccount.payer.equals(payer.publicKey));
    assert.ok(sessionAccount.host.equals(host.publicKey));
    assert.ok(sessionAccount.rate.eq(rate));
    assert.ok(sessionAccount.isActive);

    const vaultAccount = await getAccount(provider.connection, vaultPda);
    assert.equal(Number(vaultAccount.amount), Number(streamAmount));
  });

  it("Ticks a stream", async () => {
    const [sessionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("session"), payer.publicKey.toBuffer(), host.publicKey.toBuffer()],
        program.programId
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), sessionPda.toBuffer()],
        program.programId
    );

    await program.methods
      .tick()
      .accounts({
        session: sessionPda,
        vault: vaultPda,
        hostToken: hostTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const hostAccount = await getAccount(provider.connection, hostTokenAccount);
    assert.equal(Number(hostAccount.amount), Number(rate));
  });

  it("Closes a stream", async () => {
    const [sessionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("session"), payer.publicKey.toBuffer(), host.publicKey.toBuffer()],
        program.programId
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), sessionPda.toBuffer()],
        program.programId
    );

    // Verify vault balance before close (1000 - 10 = 990)
    const vaultAccount = await getAccount(provider.connection, vaultPda);
    assert.equal(Number(vaultAccount.amount), 990);

    await program.methods
      .closeStream()
      .accounts({
        session: sessionPda,
        vault: vaultPda,
        payer: payer.publicKey,
        payerToken: payerTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([payer])
      .rpc();

    // Verify session is closed (fetching should fail)
    try {
      await program.account.streamSession.fetch(sessionPda);
      assert.fail("Session account should be closed");
    } catch (e) {
      assert.include(e.message, "Account does not exist");
    }

    // Verify funds returned to payer
    // Initial: 2000
    // Sent: 1000 -> Vault
    // Tick: 10 -> Host
    // Vault Remaining: 990
    // Close: 990 -> Payer
    // Final Payer: 1000 + 990 = 1990
    const payerAccount = await getAccount(provider.connection, payerTokenAccount);
    assert.equal(Number(payerAccount.amount), 1990);
  });

  it("Initializes and Claims a Bounty", async () => {
    const secret = Buffer.from("supersecret");
    const crypto = require("crypto");
    const hash = crypto.createHash('sha256').update(secret).digest();
    const targetHash = [...hash]; // Convert to array for Anchor

    const [bountyPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("bounty"), authority.publicKey.toBuffer()],
        program.programId
    );
    const [bountyVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("bounty_vault"), bountyPda.toBuffer()],
        program.programId
    );

    await program.methods
      .initializeBounty(targetHash, bountyAmount)
      .accounts({
        bounty: bountyPda,
        bountyVault: bountyVaultPda,
        authority: authority.publicKey,
        mint: mint,
        authorityToken: authorityTokenAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([authority])
      .rpc();

    const bountyAccount = await program.account.bountyPool.fetch(bountyPda);
    assert.deepEqual(bountyAccount.targetHash, targetHash);

    // Claim Bounty
    await program.methods
      .claimBounty(secret)
      .accounts({
        bounty: bountyPda,
        bountyVault: bountyVaultPda,
        authority: authority.publicKey,
        claimerToken: claimerTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Verify claimer got funds
    const claimerAccount = await getAccount(provider.connection, claimerTokenAccount);
    assert.equal(Number(claimerAccount.amount), Number(bountyAmount));

    // Verify bounty account is closed
    try {
      await program.account.bountyPool.fetch(bountyPda);
      assert.fail("Bounty account should be closed");
    } catch (e) {
      assert.include(e.message, "Account does not exist");
    }
  });
});