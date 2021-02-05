# ldpos-chain
Simple DPoS chain module compatible with LDEX

## Running tests using mock DAL
```shell script
yarn test
```

## Running tests using knex DAL
- Start postgres inside docker container 
```shell script
./scripts/start-postgres.sh
``` 

- Run knex-dal tests
```shell script
  yarn test:using-dal-knex
```

- Stop postgres
```shell script
./scripts/stop-postgres.sh
``` 
