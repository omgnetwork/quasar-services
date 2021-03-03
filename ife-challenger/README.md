# Quasar IFE Challenger

Service that monitors for invalid (non canonical) IFE events. If any is related to a Quasar IFE it will perform the challenge.

# Setup
- Uses the following environment variables:
```
ETH_NODE=                   <entry point to an ethereum node>
WATCHER_URL=                <url of an informational watcher>
PLASMA_CONTRACT_ADDRESS=    <address of the plasma framework contract>
QUASAR_CONTRACT_ADDRESS=    <address of the quasar contract>
CHALLENGER_PRIVATE_KEY=     <private key of the challenger account>
SERVER_POLL_INTERVAL=       <interval in seconds to check watcher for byzantine events>
QUASAR_OWNER_PRIVATE_KEY=   <private key of the quasar owner>
```

# Deployment
- `$ npm install` install dependencies
- `$ npm run start` to serve client build and server at the same time
