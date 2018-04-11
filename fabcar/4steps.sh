#!/bin/bash

 rm -rf ./hfc-key-store

node enrollAdmin.js
node registerUser
node invoke.js
node query.js