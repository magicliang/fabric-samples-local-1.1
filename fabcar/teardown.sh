#!/bin/bash

cd ../basic-network
./teardown.sh

docker rmi -f $(docker images dev-* -q)
