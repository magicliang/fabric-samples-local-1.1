'use strict';
/*
* Copyright IBM Corp All Rights Reserved
*
* SPDX-License-Identifier: Apache-2.0
*/
/*
 * Register and Enroll a user
 */

var Fabric_Client = require('fabric-client');
var Fabric_CA_Client = require('fabric-ca-client');

var path = require('path');
var util = require('util');
var os = require('os');

//
var fabric_client = new Fabric_Client();
var fabric_ca_client = null;
var admin_user = null;
var member_user = null;
var store_path = path.join(__dirname, 'hfc-key-store');
console.log(' Store path:'+store_path);

// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
Fabric_Client.newDefaultKeyValueStore({ path: store_path
}).then((state_store) => {
    // assign the store to the fabric client
    fabric_client.setStateStore(state_store);
    var crypto_suite = Fabric_Client.newCryptoSuite();
    // use the same location for the state store (where the users' certificate are kept)
    // and the crypto store (where the users' keys are kept)
    var crypto_store = Fabric_Client.newCryptoKeyStore({path: store_path});
    crypto_suite.setCryptoKeyStore(crypto_store);
    fabric_client.setCryptoSuite(crypto_suite);
    var	tlsOptions = {
    	trustedRoots: [],
    	verify: false
    };
    // 这一段代码，和 enroll user 唯一的区别就是有两个空 options，看来这不影响连接 ca server
    // be sure to change the http to https when the CA is running TLS enabled
    fabric_ca_client = new Fabric_CA_Client('http://localhost:7054', null , '', crypto_suite);

    // first check to see if the admin is already enrolled
    return fabric_client.getUserContext('admin', true);
}).then((user_from_store) => {
    if (user_from_store && user_from_store.isEnrolled()) {
        console.log('Successfully loaded admin from persistence');
        admin_user = user_from_store;
    } else {
        // 如果有人删除了 store，则这一步失败。不会做这里试着做 enrollment 的。
        throw new Error('Failed to get admin.... run enrollAdmin.js');
    }
    // 用admin user来生成一个新user 1。注意看我们没有提供密码，所以后台会直接生成密码给我们。
    // at this point we should have the admin user
    // first need to register the user with the CA server
    // 这个 affiliation 居然是必须的。而且必须是ca配置文件里面可以找到的附属机构行。
    return fabric_ca_client.register({enrollmentID: 'user1', affiliation: 'blockchain.mainet',role: 'client'}, admin_user);
}).then((secret) => {
    // next we need to enroll the user with CA server
    console.log('Successfully registered user1 - secret:'+ secret);
    // 由登记过的 admin 在本地注册完成一个新 user，新的 user 再被登记生成本地的 Ecert。
    // 所以 register 还在 enroll 之前？
    return fabric_ca_client.enroll({enrollmentID: 'user1', enrollmentSecret: secret});
}).then((enrollment) => {
  console.log('Successfully enrolled member user "user1" ');
  // 像 admin 一样，用 ECert 生成 user1 的 user object。
  // 所以三部曲是这样的：register enroll 和createUser。第三步是 fabric_client 而不是 fabric_ca_client。
  return fabric_client.createUser(
     {username: 'user1',
     // 这里之所以用 Org1 MSP，还是因为 CA 的根证书直接用了 org1 的。而 org1 的容器启动的时候选的 MSP ID 就是叫这个。
     // 如果不叫这个 msp id，这个客户端证书签发的协议就不能得到背书。
     // 值得注意的是，不管admin 是什么乱七八糟的 MSP，它都可以任意指定这个user为任意的 MSP，也就是说，不关affliation 什么事。
     mspid: 'Org1--MSP',
     cryptoContent: { privateKeyPEM: enrollment.key.toBytes(), signedCertPEM: enrollment.certificate }
     });
}).then((user) => {
     member_user = user;

     return fabric_client.setUserContext(member_user);
}).then(()=>{
     console.log('User1 was successfully registered and enrolled and is ready to intreact with the fabric network');

}).catch((err) => {
    // 这一步失败也不要紧，如果本地的 store 已经有 user1 的材料的话，query 和 invoke 都可以直接跑下去的。
    console.error('Failed to register: ' + err);
	if(err.toString().indexOf('Authorization') > -1) {
		console.error('Authorization failures may be caused by having admin credentials from a previous CA instance.\n' +
		'Try again after deleting the contents of the store directory '+store_path);
	}
});
