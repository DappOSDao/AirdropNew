# DappOS Airdrop

## Scripts

### `scripts/deployAirdrop.ts`

Deploys the `Airdrop` contract with the configured ERC20 token address.

Required env variables:

```env
TOKEN_ADDRESS=0x...
```

### `scripts/createRound.ts`

Creates a new airdrop round on an existing `Airdrop` contract.

Required env variables:

```env
AIRDROP_ADDRESS=0x...
```

Script constants to review before running:

```ts
merkleRootInput
claimStartTimeInput
claimEndTimeInput
maxClaimPerAccountInput
```

### `scripts/setMerkleRoot.ts`

Updates the Merkle root for a specific round on an existing `Airdrop` contract.

Required env variables:

```env
AIRDROP_ADDRESS=0x...
```

Script constants to review before running:

```ts
roundId
merkleRootInput
```

### `scripts/setRestaking.ts`

Sets the restaking contract address on an existing `Airdrop` contract. Use the zero address to disable restaking.

Required env variables:

```env
AIRDROP_ADDRESS=0x...
RESTAKING_ADDRESS=0x...
```

### `scripts/transferOwnership.ts`

Transfers ownership for a contract that supports the Ownable `owner()` and `transferOwnership(address)` interface.

Required env variables:

```env
OWNABLE_ADDRESS=0x...
NEW_OWNER=0x...
```
