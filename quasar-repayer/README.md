# Quasar Repayer

Service that recursively merges outputs, starts a standard exit, processes the exit and repays the Quasar pool

# Setup
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
```

- Specify schedule in the following format, for eg-
```
SCHEDULE_START_EXIT='*/10 * * * * *'
SCHEDULE_PROCESS_EXIT='*/30 * * * * *'
```

# Deployment
- `$ npm install` install dependencies
- `$ npm run start` to serve client build and server at the same time