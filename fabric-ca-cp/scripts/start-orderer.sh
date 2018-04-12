#!/bin/bash
#
# Copyright IBM Corp. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
#
set -e

source $(dirname "$0")/env.sh

# Wait for setup to complete sucessfully
awaitSetup

# -u 是url， -d 是调试模式，--enrollment.profile tls 是获取 tls 格式的证书。tls一定要存在msp账户里么？是的。
# ENROLLMENT_URL 里写了 enroll 用的账户密码。
# Enroll to get orderer's TLS cert (using the "tls" profile)
fabric-ca-client enroll -d --enrollment.profile tls -u $ENROLLMENT_URL -M /tmp/tls --csr.hosts $ORDERER_HOST

# Copy the TLS key and cert to the appropriate place
TLSDIR=$ORDERER_HOME/tls
mkdir -p $TLSDIR
cp /tmp/tls/keystore/* $ORDERER_GENERAL_TLS_PRIVATEKEY
cp /tmp/tls/signcerts/* $ORDERER_GENERAL_TLS_CERTIFICATE
rm -rf /tmp/tls


# 因为之前已经往 ca 里登记过 orderer了，所以在这里直接就把证书下载到本地来。
# 直接用 msp 来获取 msp 格式的证书。这次用的是 default 的 profile
# Enroll again to get the orderer's enrollment certificate (default profile)
fabric-ca-client enroll -d -u $ENROLLMENT_URL -M $ORDERER_GENERAL_LOCALMSPDIR

# Finish setting up the local MSP for the orderer
finishMSPSetup $ORDERER_GENERAL_LOCALMSPDIR
copyAdminCert $ORDERER_GENERAL_LOCALMSPDIR

# Wait for the genesis block to be created
dowait "genesis block to be created" 60 $SETUP_LOGFILE $ORDERER_GENERAL_GENESISFILE

# Start the orderer
env | grep ORDERER
# 最后再执行本节点的关键命令
orderer
