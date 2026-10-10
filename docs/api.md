# Wardrobe API

Generated handlers live in `integration/cloud-code.js`.

## outcastWardrobeAccess

Reads the authenticated user's signature-verified linked wallet and checks the fixed OUTCAST mint through Solana RPC. Returns eligible thresholds with a 60-second validity period. Wallet addresses and exact balances are not returned to the game.

## outcastEquipCosmetic

Accepts a cosmetic category and item identifier. The server reads the requirement from its shared catalog and checks holdings again. Approved selection and expiration are written to ReadOnly user data. See the implementation for exact payload and response fields.

## Configuration

- Mint: `3BCFLiDS7HJBvo23r91dCDERJi8GgdqeQb8zfrXgidos`.
- Decimals: 6.
- RPC host: `api.mainnet-beta.solana.com`.
- Game access remains open; holding requirements apply to cosmetics.

See `integration/README.md` for SDK bundling and platform configuration.
