#!/bin/bash
#
# Copyright IBM Corp. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
#

# This script is designed to be run in the org3cli container as the
# first step of the EYFN tutorial.  It creates and submits a
# configuration transaction to add org3 to the network previously
# setup in the BYFN tutorial.
#

# step1 修改 channel 配置。

# 这些环境变量在每次容器重启的时候都要重新注入，因为 shell 的 env 的生命周期就是这样。
# 取几种参数的方法，注意 $0 是脚本名。
CHANNEL_NAME="$1"
DELAY="$2"
LANGUAGE="$3"
TIMEOUT="$4"
: ${CHANNEL_NAME:="mychannel"}
: ${DELAY:="3"}
: ${LANGUAGE:="golang"}
: ${TIMEOUT:="10"}
LANGUAGE=`echo "$LANGUAGE" | tr [:upper:] [:lower:]`
COUNTER=1
MAX_RETRY=5
# 这里这个 tls ca 是所有场景下通用的？
ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem

CC_SRC_PATH="github.com/chaincode/chaincode_example02/go/"
if [ "$LANGUAGE" = "node" ]; then
	CC_SRC_PATH="/opt/gopath/src/github.com/chaincode/chaincode_example02/node/"
fi

# import utils
. scripts/utils.sh

echo
echo "========= Creating config transaction to add org3 to network =========== "
echo

# 这个 jq 会因为 docker 的缓存层被持久化起来
echo "Installing jq"
apt-get -y update && apt-get -y install jq

# Fetch the config for the channel, writing it to config.json
fetchChannelConfig ${CHANNEL_NAME} config.json

# Modify the configuration to append the new org
# set 是一个类似 env 的命令。
set -x
# 这里这个层层的大括号，类似对json 的 [][] path 赋值。.[1]之类的就是 jq 的占位符。
# 换言之，增加一个组织，只要在 channel_group 底层的 group 里增加一个 MSP 的键值对就行了。
jq -s '.[0] * {"channel_group":{"groups":{"Application":{"groups": {"Org3MSP":.[1]}}}}}' config.json ./channel-artifacts/org3.json > modified_config.json
set +x

# 用旧的 json 和新的 json 计算 delta json。
# Compute a config update, based on the differences between config.json and modified_config.json, write it as a transaction to org3_update_in_envelope.pb
createConfigUpdate ${CHANNEL_NAME} config.json modified_config.json org3_update_in_envelope.pb

echo
echo "========= Config transaction to add org3 to network created ===== "
echo

# 接下来就比较讨厌了，因为 mod_policy 是 Admins，而它的默认要求是 majority。 
echo "Signing config transaction"
echo
# 这会直接改变这个文件的内容，用 ls 可以看到
signConfigtxAsPeerOrg 1 org3_update_in_envelope.pb

echo
echo "========= Submitting transaction from a different peer (peer0.org2) which also signs it ========= "
echo
setGlobals 0 2
set -x
# 这个命令会自动根据当前环境变量对这个pb文件进行签名，注意，这里又使用到了 channel 名和 orderer 地址。
peer channel update -f org3_update_in_envelope.pb -c ${CHANNEL_NAME} -o orderer.example.com:7050 --tls --cafile ${ORDERER_CA}
set +x
#  看到这句话，频道就更新了：Successfully submitted channel update
#  用 docker logs -f peer0.org1.example.com 看 peer 的log，可以看到一个新的区块被加到 ledger 上。
echo
echo "========= Config transaction to add org3 to network submitted! =========== "
echo

exit 0
