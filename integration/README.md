# OUTCAST wardrobe integration

Token: OUTCAST, Solana mainnet.
Mint: `3BCFLiDS7HJBvo23r91dCDERJi8GgdqeQb8zfrXgidos`; decimals: 6.

`cosmetics-catalog.json` is the fixed shared policy: 6 of 28 non-empty cosmetics
are free; the other 22 require 10,000, 20,000, 30,000 or 50,000 tokens.
All colors and the `none` selection are free. Do not rerun `create-catalog.mjs`
unless intentionally replacing the published policy for every player.
Each wardrobe tab sorts cosmetics by its fixed holding requirement:
free, 10,000, 20,000, 30,000, then 50,000 OUTCAST.

The browser bridge uses official iDosGames core/wallet SDKs. Embedded games use
the platform wallet bridge; standalone pages use an injected Solana wallet.
Ownership is proved by an off-chain wallet signature. No transfer, deposit or
purchase is initiated by the wardrobe.

`cloud-code.js` is generated from the same catalog by `write-cloud-code.mjs`.
The server reads the caller's signature-verified linked wallet, queries token
accounts for the fixed mint through `api.mainnet-beta.solana.com`, sums raw
integer amounts, and returns eligible thresholds with a 60-second expiry.
Paid selection is checked again server-side and saved in ReadOnly custom data.
Network errors and expired permissions fail closed. No client-reported token
amount or arbitrary wallet/mint address is accepted.

Published handlers on PROD and DEV: `outcastWardrobeAccess`,
`outcastEquipCosmetic`. DEV checks this actual mainnet token too.
CloudCode HTTP permits only the official Solana RPC host for this integration.
The game's PlayAccess stays Open so free players can play.

Build the bridge after changing its source:

```powershell
node integration/node_modules/esbuild/bin/esbuild integration/platform-bridge.js --bundle --format=iife --platform=browser --target=es2020 --minify --outfile=vendor/idos-platform.js
node integration/write-cloud-code.mjs
```

Source files in the iDosGames editor were synchronized; uploaded static build v6
and compiled source build v7 contain the same wardrobe integration.
Source build v9 with ascending wardrobe sorting and mobile joystick is Live at
https://6kxnox5i.idos.games/ and https://idosgames.com/app/6KXNOX5I/.
Earlier builds remain available in history.
No wallet signature or token transaction was executed by the coding agent.

Mobile movement uses a persistent HUD joystick on touch devices and viewports
up to 900px wide. Pointer capture keeps movement active while the thumb moves
outside its base, and a second finger can use action buttons. Releasing,
canceling, changing phase, opening a panel, resizing, or losing focus clears
the analog input. Mobile HUD placement accounts for safe-area insets and
portrait/landscape layouts. Keyboard controls continue to use the same engine.
