use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod paystream {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, rate: u64) -> Result<()> {
        let session = &mut ctx.accounts.session;
        session.rate = rate;
        session.is_active = true;
        session.payer = ctx.accounts.payer.key();
        session.host = ctx.accounts.host.key();
        Ok(())
    }

    pub fn tick(ctx: Context<Tick>) -> Result<()> {
        let session = &ctx.accounts.session;
        require!(session.is_active, PayStreamError::SessionInactive);

        let amount = session.rate;

        // Transfer from Vault -> Host
        // Seeds: [b"session", payer.key().as_ref(), host.key().as_ref()]
        let payer_key = ctx.accounts.payer.key();
        let host_key = ctx.accounts.host.key();
        let seeds = &[
            b"session",
            payer_key.as_ref(),
            host_key.as_ref(),
            &[ctx.bumps.session],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.host_token_account.to_account_info(),
            authority: ctx.accounts.session.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token::transfer(cpi_ctx, amount)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init, 
        payer = payer, 
        space = 8 + 8 + 1 + 32 + 32,
        seeds = [b"session", payer.key().as_ref(), host.key().as_ref()],
        bump
    )]
    pub session: Account<'info, Session>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Safe
    pub host: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Tick<'info> {
    #[account(
        mut,
        seeds = [b"session", payer.key().as_ref(), host.key().as_ref()],
        bump
    )]
    pub session: Account<'info, Session>,
    /// CHECK: Read-only for seeds
    pub payer: AccountInfo<'info>,
    /// CHECK: Read-only for seeds
    pub host: AccountInfo<'info>,
    #[account(
        mut,
        constraint = vault.owner == session.key()
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub host_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Session {
    pub rate: u64,
    pub is_active: bool,
    pub payer: Pubkey,
    pub host: Pubkey,
}

#[error_code]
pub enum PayStreamError {
    #[msg("Session is inactive")]
    SessionInactive,
}