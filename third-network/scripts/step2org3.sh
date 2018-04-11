#!/bin/bash
#
# Copyright IBM Corp. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
#

# This script is designed to be run in the org3cli container as the
# second step of the EYFN tutorial. It joins the org3 peers to the
# channel previously setup in the BYFN tutorial and install the
# chaincode as version 2.0 on peer0.org3.
#
# step 2 把所有的新 peer 加入 channel 中，重新安装 2.0 的 chaincode，升级 endorsement policy 必须如此。
echo
echo "========= Getting Org3 on to your first network ========= "
echo
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
ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem

CC_SRC_PATH="github.com/chaincode/chaincode_example02/go/"
if [ "$LANGUAGE" = "node" ]; then
	CC_SRC_PATH="/opt/gopath/src/github.com/chaincode/chaincode_example02/node/"
fi

# import utils
. scripts/utils.sh

# 这一步纯粹是为了在 org3 节点加入 network 以前输出一些确认信息。
echo "Fetching channel config block from orderer..."
set -x
# 获取这个channel的0号区块，即channel genesis block。永远是区块0。
peer channel fetch 0 $CHANNEL_NAME.block -o orderer.example.com:7050 -c $CHANNEL_NAME --tls --cafile $ORDERER_CA >&log.txt
res=$?
set +x
cat log.txt
verifyResult $res "Fetching config block from orderer has Failed"

echo "===================== Having peer0.org3 join the channel ===================== "
joinChannelWithRetry 0 3
echo "===================== peer0.org3 joined the channel \"$CHANNEL_NAME\" ===================== "
echo "===================== Having peer1.org3 join the channel ===================== "
joinChannelWithRetry 1 3
echo "===================== peer1.org3 joined the channel \"$CHANNEL_NAME\" ===================== "
echo "Installing chaincode 2.0 on peer0.org3..."
installChaincode 0 3 2.0

echo
echo "========= Got Org3 halfway onto your first network ========= "
echo

exit 0
