# Local deployment and operations

Install Node.js 24 and Docker Engine/Desktop with Linux containers. This project uses Hardhat 3, solc-js 0.8.37, ethers 6, OpenZeppelin 5, Vite 8, and Python 3.12 inside the sandbox image. Exact versions and transitive dependencies are locked in `package-lock.json`; `tmp` is overridden to patched 0.2.7. Compilation uses the installed compiler package, avoiding remote Solidity compiler downloads.

```sh
npm ci
docker pull python:3.12-alpine
npm start
```

Services:

| Service | Loopback port | Purpose |
| --- | --- | --- |
| Frontend | 5174 | Wallet UI and read-only spectator views |
| Hardhat RPC | 18545 | Local chain 31337, unlocked fictional accounts |
| Primary verifiers | 8781-8783 | Independent source evaluations and commit/reveal votes |
| Appeal verifiers | 8784-8786 | Replay during disputed round |

The launcher writes service logs to ignored `test-results/`, deployment addresses/ABIs to ignored `web/deployment.json`, and verifier state to ignored `judge/data/{deploymentBlockHash}/{verifierIndex}`. Different verifier processes use different accounts, reports, random salts and container executions. Keep report directories intact during a round: losing a salt after commitment prevents that node from revealing. A fresh deployment gets a separate state namespace.

The browser status shows wallet/RPC/transaction errors. If a port is occupied, stop the old instance of this project before starting another. `npm start` runs in the foreground and Ctrl+C stops the processes it launched. Do not expose the unlocked RPC or Docker-backed verifier endpoints beyond loopback. The application deliberately has no real payment, purchase, redemption, exchange or public-chain deployment path.

## Individual commands

For debugging, use separate terminals from the repository root:

```sh
npm run compile
npm run chain
```

With the chain running:

```sh
npm run deploy
npm run dev
```

Start each verifier separately with `VERIFIER_INDEX` 1 through 6. POSIX shell:

```sh
VERIFIER_INDEX=1 npm run judge
```

PowerShell:

```powershell
$env:VERIFIER_INDEX = '1'
npm run judge
```

Start the permissionless keeper with `node scripts/keeper.mjs`. The deploy script enables a 1,000 ms block interval; verification deadlines then advance without new player transactions. The test runner uses another chain/port and deterministic EVM time travel. Only local chain ID 31337 is accepted by the supplied scripts. Constructors additionally allow local chain ID 1337; no supplied script configures a public testnet or mainnet.

## Verifier HTTP protocol

`GET /health` returns its verifier address, index, round and evaluation-busy status. `POST /submissions` accepts:

```json
{"matchId":1,"source":"a,b=map(int,input().split());print(a+b)","signature":"0x..."}
```

The exact UTF-8 message signed by the matching captain is:

```text
CodeChef local submission
31337
<Arena address exactly as deployment.json>
<decimal match ID>
<0x-prefixed keccak256 source hash>
```

The signature is an EIP-191 wallet message signature. The captain must have anchored the same source hash in Arena before the solve deadline. Delivery closes at that deadline too, and cannot replace a committed verifier report. Source is limited to 16 KiB; HTTP body to 24,000 bytes. Allowed browser origins are localhost/127.0.0.1 port 5174. There is no server-provided result override endpoint.

## Frontend production build

`npm run build` emits `web/dist/` and copies the current local deployment metadata if available. Serve this directory with a local static server; the RPC and verifier processes must remain running. The default verifier browser-origin allowlist expects port 5174. Vite development hosting is the supported one-command demo; there is no claim of a publicly hosted or remotely operated deployment.

## Tests and recovery

`npm test` compiles, starts a disposable Hardhat node on 19545, runs contract tests, then terminates its node. `npm run test:sandbox` requires the pre-pulled image and running Docker. Run those before the live demo to avoid CPU contention with short voting windows. `npm run demo` requires `npm start` and advances its shared test clock: do not run it during a manual timed match.

The optional `test/browser.py` needs Python with `playwright` installed and either its Chromium browser or `CHROME_PATH` pointing to Chrome. Run it against the started and demo-populated application. It creates/accepts a match and delivers code, so it changes local chain state. Screenshots and JSON evidence are saved under `docs/results/`.

Stopping a verifier leaves its durable salt/report on disk; restart it with the same index to resume within its phase windows. Missing primary quorum or missing appeal quorum resolves to a draw, with refunds allocated after the appropriate review phase. Stopping the keeper does not lock out manual `progress`, `expire`, `advance`, or `claim`. Stopping the Hardhat node resets chain state; start/deploy again rather than using stale deployment metadata. Never send real assets to the openly known development accounts.
