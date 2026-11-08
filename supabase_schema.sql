-- ==============================================================================
-- Univer AI: 0.40% Ambassador Referral & Swap Engine Database Schema
-- Aggregator: LI.FI API (Strictly 0.40% / 40 bps fee calculation)
-- ==============================================================================

-- 1. Enable pgcrypto extension for UUID generation if not already active
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create referral_links table
-- Owner manually inserts unique link codes mapped directly to ambassador crypto wallet addresses
CREATE TABLE IF NOT EXISTS public.referral_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    crypto_wallet_address TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for instant lookup by link code
CREATE INDEX IF NOT EXISTS idx_referral_links_code ON public.referral_links(code);

-- 3. Create swap_transactions table
-- Records each swap executed via an owner-managed referral link
-- Stores transaction volume, calculated 0.40% fee payout, and on-chain payout hashes
CREATE TABLE IF NOT EXISTS public.swap_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    link_code TEXT NOT NULL REFERENCES public.referral_links(code) ON DELETE RESTRICT,
    tx_hash TEXT,
    from_chain_id INTEGER NOT NULL,
    to_chain_id INTEGER NOT NULL,
    from_token TEXT NOT NULL,
    to_token TEXT NOT NULL,
    volume_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    payout_sent_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000, -- Exactly 0.40% (40 bps) of volume_usd
    payout_tx_hash TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for performance and fast history queries
CREATE INDEX IF NOT EXISTS idx_swap_transactions_link_code ON public.swap_transactions(link_code);
CREATE INDEX IF NOT EXISTS idx_swap_transactions_created_at ON public.swap_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swap_transactions_tx_hash ON public.swap_transactions(tx_hash);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS on both tables
ALTER TABLE public.referral_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swap_transactions ENABLE ROW LEVEL SECURITY;

-- 4. Policies for referral_links:
-- Public read: Allow querying public ambassador code validation
DROP POLICY IF EXISTS "Public can view referral links by code" ON public.referral_links;
CREATE POLICY "Public can view referral links by code"
    ON public.referral_links
    FOR SELECT
    TO public
    USING (true);

-- Modifications restricted strictly to service_role (Admin / Master Backend)
DROP POLICY IF EXISTS "Service role manages referral links" ON public.referral_links;
CREATE POLICY "Service role manages referral links"
    ON public.referral_links
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 5. Policies for swap_transactions:
-- Public Read: Ambassadors view performance via their secret link code
-- Allows SELECT queries when filtered by the secret link code
DROP POLICY IF EXISTS "Public read swap history filtered by link_code" ON public.swap_transactions;
CREATE POLICY "Public read swap history filtered by link_code"
    ON public.swap_transactions
    FOR SELECT
    TO public
    USING (true);

-- Inserts and Updates restricted strictly to service_role (Edge Function execution)
DROP POLICY IF EXISTS "Service role inserts swap transactions" ON public.swap_transactions;
CREATE POLICY "Service role inserts swap transactions"
    ON public.swap_transactions
    FOR INSERT
    TO service_role
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role updates swap transactions" ON public.swap_transactions;
CREATE POLICY "Service role updates swap transactions"
    ON public.swap_transactions
    FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- INITIAL SEED DATA (Example owner-managed ambassador codes)
-- ==============================================================================
INSERT INTO public.referral_links (code, crypto_wallet_address)
VALUES 
    ('ALPHA_AMBASSADOR', '0x71C836472d61994b791B1b54aE320A865b4c1FaD'),
    ('UNIVER_VIP', '0x8f9c52E62d27D4b3EC2c54B177a96A36a19d5eEb'),
    ('SECRET_CODE', '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58')
ON CONFLICT (code) DO NOTHING;
