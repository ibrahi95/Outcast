# Architecture

## Game client

`index.html` loads the JavaScript modules in order. `js/engine.js` combines keyboard and joystick input. `js/hud.js` handles pointer capture and clears movement when focus, phase, or panels change. `js/render.js` renders the world. Maps, tasks, roles, audio, and characters have separate modules.

`js/net.js` uses bundled PeerJS for WebRTC rooms. A public signaling broker helps peers connect; the host browser manages gameplay. Restrictive NATs can prevent connections.

## Platform integration

`integration/platform-bridge.js` is bundled into `vendor/idos-platform.js`. Official iDosGames SDKs provide authentication, wallet linking, and CloudCode calls. Embeds use the platform wallet panel; standalone pages use an injected Solana wallet.

`integration/cosmetics-catalog.json` is the fixed shared policy. Its browser counterpart is `js/cosmetics-catalog.js`. `integration/write-cloud-code.mjs` generates handlers from the same policy.

## Holding verification

CloudCode reads the signature-verified linked Solana wallet and queries token accounts for the fixed OUTCAST mint. It validates account owner, mint, and decimals, then sums integer atomic amounts. Eligible tiers expire after 60 seconds. Equipping rechecks holdings and writes the selection to protected user data.

The client does not supply the authoritative wallet, balance, mint, or holding requirement. Network errors and expired access deny restricted items. Free items remain available. Gameplay and appearance synchronization still use the host browser; wardrobe verification is not a general anti-cheat system.

## Deployment

Public title: `6KXNOX5I`. Sandbox: `6KXNOX5I-DEV`. Both wardrobe configurations use the actual mainnet token. Version 9 contains the mobile HUD and is live on iDosGames. Source commits do not automatically publish platform configuration or CloudCode.
