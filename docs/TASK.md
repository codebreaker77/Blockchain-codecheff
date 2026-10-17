# Blockchain Development

Source: promocycle-tasks.pdf, CodeChef-VIT Promotional Cycle 2026-27, pages 17-18. The original PDF is in the parent workspace, outside this standalone repository.

Status: implemented; see the project README and verification results.

All tokens are fictional and non-redeemable. Only a local blockchain is configured. AI tools and libraries are permitted; participants must understand and explain their submission.

## Task sheet context

Task: CodeChef Casino: Bet Your Tokens!
Problem Statement
Imagine a coding competition where participants don't just solve problems for points. They can also stake
virtual tokens on their ability to solve them.
Two participants can challenge each other, stake tokens, and compete to solve a programming problem.
The winner takes the prize pool.
But there's a catch. What happens if someone refuses to accept defeat, submits a fake result, or abandons
the challenge halfway through?
Your task is to build a blockchain-powered competitive coding arena where participants can create
challenges, stake virtual tokens, and receive rewards based on verifiable competition results.
All tokens must be fictional, have no monetary value, and operate exclusively on a local blockchain or
testnet.
Expected Functionality
01   Allow participants to connect their wallets and receive virtual test tokens.
02   Let users create coding challenges with a specified token stake.
03   Allow another participant to accept the challenge by matching the stake.
04   Lock both participants' tokens in a smart contract until the challenge concludes.
05   Implement a mechanism to submit and verify competition results.
06   Automatically distribute the prize pool to the winner.
07   Handle draws, abandoned challenges, timeouts, and disputed results.
08   Prevent double claims, unauthorized withdrawals, and manipulation of challenge outcomes.
Suggested Tech Stack
•   Blockchain: Ethereum-compatible local blockchain or testnet.
•   Smart Contracts: Solidity.
•   Development Framework: Hardhat or Foundry.
•   Frontend: React, Next.js, or equivalent.
•   Wallet Integration: MetaMask, Wagmi, Viem, or Ethers.js.
•   Tokens: ERC-20 test tokens with no real-world value.
•   Testing: Hardhat Network or Anvil.
Required Deliverables
•   Functional application for creating and accepting coding challenges.
•   Smart contracts for managing virtual tokens, challenges, and rewards.
•   A basic frontend displaying active challenges, participant balances, and results.
•   Automated tests covering challenge creation, settlement, refunds, and invalid transactions.
•   Architecture diagram explaining how results are verified and rewards distributed.
•   README containing setup instructions, deployment steps, and technical decisions.
A simulated coding judge is acceptable. Building a complete online compiler is not required.
Bonus
•   Introduce tournaments with multiple participants and progressive elimination.

•   Implement an on-chain leaderboard and ranking system.
•   Create team-based challenges with shared virtual reward pools.
•   Integrate a sandboxed code execution engine to evaluate submissions.
•   Implement a commit-reveal mechanism to reduce opportunities for result manipulation.
•   Design a decentralized result verification mechanism.
•   Add achievement badges or non-transferable trophies for tournament winners.
•   Build a spectator mode where users can follow active matches.
The Twist: Who Decides the Winner?
Your smart contract cannot independently determine whether someone's code passed all test cases.
Suppose the competition server reports that Player A won, but Player B claims the result was manipulated.
How would your system determine which result to trust?
You are free to implement an oracle, trusted judge, cryptographic verification mechanism, dispute process,
or another approach.
Explain why you chose your solution and what prevents someone from manipulating it.
Note: This is strictly a simulated, non-monetary coding competition. No real-money betting, cryptocurrency
payments, or redeemable prizes should be implemented.
The focus is on smart contract logic, secure settlement, result verification, and handling situations where
participants or external systems cannot be blindly trusted.
