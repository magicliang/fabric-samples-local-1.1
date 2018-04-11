#!/bin/bash
#
# Copyright IBM Corp All Rights Reserved
#
# SPDX-License-Identifier: Apache-2.0
#
# Exit on first error, print all commands.
set -e

# Shut down the Docker containers for the system tests.
# 先 kill 再 down
docker-compose -f docker-compose.yml kill && docker-compose -f docker-compose.yml down

# 删除home目录下的这个文件夹。但fabcar应用生成的store都不在这里，所以什么都删除不掉。
# remove the local state
rm -f ~/.hfc-key-store/*

# 只删除链码镜像
# remove chaincode docker images
docker rmi $(docker images dev-* -q)

# Your system is now clean
