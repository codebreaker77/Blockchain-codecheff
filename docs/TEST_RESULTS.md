# Verification results

Verified on 2026-10-17 on Windows with Node 24.19.0 and Docker Desktop/WSL2. Contract tests execute actual compiled Solidity transactions against a separate Hardhat chain; sandbox tests invoke real constrained Docker containers.

## Contracts

`npm test`: **20 passed, 0 failed**, 27.14 seconds for the test runner (compilation additional).

Coverage: once-only faucet; matching escrow; cancellation; acceptance expiry; invalid stakes/self-matches/sponsorship; immutable captain-only submissions; quorum settlement and single claims; draws; abandonment/no quorum; one dishonest verifier; unauthorized/early/duplicate votes and incorrect salts; commitment domain separation; separate-panel appeals and reversal; appeal silence refunds; consented team reward splitting; verifier/participant separation; four-player/two-round and eight-player/three-round elimination; soulbound trophy; registration refunds; drawn bracket refunds and pool conservation.

Compiled deployed contract sizes: Arena 11,032 bytes; ChefToken 1,874; Tournament 5,487; WinnerTrophy 3,741. All are below EIP-170's 24,576-byte limit. The compile script enforces that limit instead of enabling unlimited contract size on the test chain.

## Actual sandbox execution

`npm run test:sandbox`: **8 passed, 0 failed**, 25.50 seconds.

Verified passing/wrong Python programs, infinite-loop termination with container cleanup, output-flood termination, unprivileged UID/read-only root filesystem, blocked network egress, constrained memory abuse, and source-size rejection before execution. No source was run directly in the host Python process.

## Live application

`npm run demo` used the actual deployed local contracts, signed source delivery, six independently running verifier processes, Docker evaluations, primary commit/reveal, participant appeal, separate-panel replay, keeper settlement and successful prize withdrawal. Three primary and three appeal votes chose the correct program, and 20 fictional CHEF were claimed. [Machine-readable result](results/live-demo.json).

These are separate local processes/accounts, not six independent real-world operators; committee collusion and the shared host remain explicit trust assumptions.

## Browser

The Playwright 1.64/Chrome smoke test **passed** at a 1440px desktop and 390px mobile viewport: default spectator view, local-wallet switching, creating/accepting a funded match, anchoring and delivering a signed solution to all six verifiers, tournament and leaderboard views, no mobile overflow and no JavaScript runtime errors. Evidence: [browser.json](results/browser.json), [desktop](results/desktop.png), [mobile](results/mobile.png). The same script runs with Chromium in CI; it is optional when reproducing locally because it requires separate browser tooling.

## Build and dependency checks

`npm run build` emits the production frontend bundle. `npm audit` reports zero dependency advisories with the patched `tmp` override and current pinned package set. `npm ci` uses the committed lockfile. The GitHub Actions workflow repeats contract tests, Docker abuse tests, signed-source/appeal end-to-end flow, frontend build and audit from a clean checkout.

These checks demonstrate the implemented local task flows. They are not a formal audit, public hostile-code security certification, proof of independent verifier operation, production load benchmark, or real-money suitability claim.
