# Running the Integration tests

- Uses the following environment variables:
```
ETH_NODE=                   <entry point to an ethereum node>
WATCHER_URL=                <url of an informational watcher>
PLASMA_CONTRACT_ADDRESS=    <address of the plasma framework contract>
ERC20_CONTRACT_ADDRESS=     <erc20 token contract for faucet>
QUASAR_CONTRACT_ADDRESS=    <address of the quasar contract>
TOPUP_MULTIPLIER=           <<topup multiplier>>
MIN_AMOUNT_ETH_PER_TEST=    <<minimum amount of eth per test>>
FUND_ACCOUNT=               <account with funds for tests>
FUND_ACCOUNT_PRIVATEKEY=    <private key of fund account>
CHALLENGER_PRIVATE_KEY=     <private key of the challenger account>
SERVER_POLL_INTERVAL=       <interval in seconds to check watcher for byzantine events>
QUASAR_OWNER_PRIVATE_KEY=   <private key of the quasar owner>
EXIT_PERIOD=                <min exit period of plasma contracts>
```

Run tests using -
```
npm run integration-test
```