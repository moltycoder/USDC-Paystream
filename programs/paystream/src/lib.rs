use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use ephemeral_rollups_sdk::anchor::{delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;

declare_id!("9vuRDYCkXmYx7vkfxzEm4biKEVyqShfSbAik1uK3y72t");

#[ephemeral]
#[program]
pub mod paystream {
    use super::*;

    pub fn initialize_stream(ctx: Context<InitializeStream>, rate: u64, amount: u64) -> Result<()> {
        let session = &mut ctx.accounts.session;
        session.payer = ctx.accounts.payer.key();
        session.host = ctx.accounts.host.key();
        session.rate = rate;
        session.is_active = true;
        session.bump = ctx.bumps.session;
        session.total_deposited = amount;
        session.accumulated_amount = 0;

        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.payer_token.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, amount)?;

        Ok(())
    }

    pub fn tick(ctx: Context<Tick>) -> Result<()> {
        msg!("Tick instruction called");
        let session = &mut ctx.accounts.session;
        
        require!(session.is_active, PayStreamError::StreamInactive);

        // Virtual Accounting Check
        require!(
            session.accumulated_amount + session.rate <= session.total_deposited,
            PayStreamError::InsufficientFunds
        );

        // Update State (On ER)
        session.accumulated_amount += session.rate;

        Ok(())
    }

    pub fn close_stream(ctx: Context<CloseStream>) -> Result<()> {
        let session = &ctx.accounts.session;
        
        // Seeds for CPI signing
        let seeds = &[
            b"session_v1",
            session.payer.as_ref(),
            session.host.as_ref(),
            &[session.bump],
        ];
        let signer = &[&seeds[..]];

        // 1. Pay Host (Accumulated Amount)
        if session.accumulated_amount > 0 {
            let transfer_host_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.host_token.to_account_info(),
                    authority: session.to_account_info(),
                },
                signer,
            );
            token::transfer(transfer_host_ctx, session.accumulated_amount)?;
        }

        // 2. Refund Payer (Remaining)
        let remaining = ctx.accounts.vault.amount;
        // Note: vault.amount is live data. If we just transferred to host, remaining should be correct.
        
        if remaining > 0 {
            let transfer_payer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.payer_token.to_account_info(),
                    authority: session.to_account_info(),
                },
                signer,
            );
            token::transfer(transfer_payer_ctx, remaining)?;
        }

        Ok(())
    }

    pub fn initialize_bounty(ctx: Context<InitializeBounty>, target_hash: [u8; 32], amount: u64) -> Result<()> {
        let bounty = &mut ctx.accounts.bounty;
        bounty.authority = ctx.accounts.authority.key();
        bounty.target_hash = target_hash;
        bounty.bump = ctx.bumps.bounty;

        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.authority_token.to_account_info(),
                to: ctx.accounts.bounty_vault.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, amount)?;

        Ok(())
    }

    pub fn claim_bounty(ctx: Context<ClaimBounty>, secret: Vec<u8>) -> Result<()> {
        let bounty = &ctx.accounts.bounty;
        let hash = anchor_lang::solana_program::hash::hash(&secret).to_bytes();
        
        require!(hash == bounty.target_hash, PayStreamError::InvalidSecret);

        let amount = ctx.accounts.bounty_vault.amount;
        
        let seeds = &[
            b"bounty",
            bounty.authority.as_ref(),
            &[bounty.bump],
        ];
        let signer = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.bounty_vault.to_account_info(),
                to: ctx.accounts.claimer_token.to_account_info(),
                authority: bounty.to_account_info(),
            },
            signer,
        );
        token::transfer(transfer_ctx, amount)?;

        Ok(())
    }
    
    pub fn delegate(ctx: Context<DelegateInput>) -> Result<()> {
        let payer_key = ctx.accounts.payer.key();
        let host_key = ctx.accounts.host.key();
        
        // Construct BASE seeds (NO BUMP) for delegation derivation
        let seeds: &[&[u8]] = &[
            b"session_v1",
            payer_key.as_ref(),
            host_key.as_ref(),
        ];
        
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            seeds,
            DelegateConfig::default(),
        )?;
        
        Ok(())
    }
}

// ... Accounts structs ...

#[derive(Accounts)]
pub struct InitializeStream<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 8 + 1 + 1 + 8 + 8,
        seeds = [b"session_v1", payer.key().as_ref(), host.key().as_ref()],
        bump
    )]
    pub session: Account<'info, StreamSession>,
    #[account(
        init,
        payer = payer,
        token::mint = mint,
        token::authority = session,
        seeds = [b"vault", session.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Host can be any address
    pub host: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub payer_token: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Tick<'info> {
    #[account(
        mut,
        seeds = [b"session_v1", session.payer.as_ref(), session.host.as_ref()],
        bump = session.bump
    )]
    pub session: Account<'info, StreamSession>,
}

#[derive(Accounts)]
pub struct CloseStream<'info> {
    #[account(
        mut,
        close = payer,
        seeds = [b"session_v1", session.payer.as_ref(), session.host.as_ref()],
        bump = session.bump
    )]
    pub session: Account<'info, StreamSession>,
    #[account(
        mut,
        token::authority = session,
        seeds = [b"vault", session.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub host_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub payer_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializeBounty<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 1,
        seeds = [b"bounty", authority.key().as_ref()],
        bump
    )]
    pub bounty: Account<'info, BountyPool>,
    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = bounty,
        seeds = [b"bounty_vault", bounty.key().as_ref()],
        bump
    )]
    pub bounty_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub authority_token: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ClaimBounty<'info> {
    #[account(
        mut,
        seeds = [b"bounty", bounty.authority.as_ref()],
        bump = bounty.bump
    )]
    pub bounty: Account<'info, BountyPool>,
    #[account(
        mut,
        token::authority = bounty,
        seeds = [b"bounty_vault", bounty.key().as_ref()],
        bump
    )]
    pub bounty_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub claimer_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateInput<'info> {
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"session_v1", payer.key().as_ref(), host.key().as_ref()],
        bump = pda.bump
    )]
    pub pda: Account<'info, StreamSession>,
    /// CHECK: Host used for seed verification
    pub host: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct StreamSession {
    pub payer: Pubkey,
    pub host: Pubkey,
    pub rate: u64,
    pub is_active: bool,
    pub bump: u8,
    pub total_deposited: u64,
    pub accumulated_amount: u64,
}

#[account]
pub struct BountyPool {
    pub authority: Pubkey,
    pub target_hash: [u8; 32],
    pub bump: u8,
}

#[error_code]
pub enum PayStreamError {
    #[msg("Stream is inactive")]
    StreamInactive,
    #[msg("Invalid secret")]
    InvalidSecret,
    #[msg("Insufficient funds in stream allocation")]
    InsufficientFunds,
}
