# Running the Integration tests

- Uses the following environment variables:
```
ETH_NODE=                            <entry point to an ethereum node>
WATCHER_URL=                         <url of an informational watcher>
PLASMAFRAMEWORK_CONTRACT_ADDRESS=    <address of the plasma framework contract>
ACCOUNT_PK=                          <private key of quasar owner>
TOKEN=                               <token>
POLL_INTERVAL=                       <poll interval in ms>
QUASAR_CONTRACT_ADDRESS=             <address of the quasar contract>
SCHEDULE_START_EXIT=                 <schedule for recursive merge and start exit>
SCHEDULE_PROCESS_EXIT=               <schedule to attempt repayments>

TOPUP_MULTIPLIER=           <<topup multiplier>>
MIN_AMOUNT_ETH_PER_TEST=    <<minimum amount of eth per test>>
FUND_ACCOUNT=               <account with funds for tests>
FUND_ACCOUNT_PRIVATEKEY=    <private key of fund account>
ERC20_CONTRACT_ADDRESS=     <erc20 token contract for faucet>
EXIT_PERIOD=                <exit period in ms + buffer>
```

Start the repayment service -
```
npm run start
```

Run tests using -
```
npm run integration-test
```