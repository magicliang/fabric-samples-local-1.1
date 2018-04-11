'use strict';
/*
* Copyright IBM Corp All Rights Reserved
*
* SPDX-License-Identifier: Apache-2.0
*/
/*
 * 这个文件的用意，就是登记 admin user。
 * Enroll the admin user
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
/**
实际的目录不在home下面，在本目录下面 fabcar/hfc-key-store
__dirname: 总是返回被执行的 js 所在文件夹的绝对路径
__filename: 总是返回被执行的 js 的绝对路径
process.cwd(): 总是返回运行 node 命令时所在的文件夹的绝对路径
./: 跟 process.cwd() 一样、一样、一样的吗？
*/
var store_path = path.join(__dirname, 'hfc-key-store');
console.log(' Store path:'+store_path);

// 由普通 client 而不是 ca client 的工厂方法生成 hfc 的 keystore 仓库
// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
Fabric_Client.newDefaultKeyValueStore({ path: store_path
}).then((state_store) => {
    // assign the store to the fabric client
    fabric_client.setStateStore(state_store);
    var crypto_suite = Fabric_Client.newCryptoSuite();
    // state store 和 key store 用同一个位置
    // use the same location for the state store (where the users' certificate are kept)
    // and the crypto store (where the users' keys are kept)
    var crypto_store = Fabric_Client.newCryptoKeyStore({path: store_path});
    crypto_suite.setCryptoKeyStore(crypto_store);
    // 把 crypto_suite 和 fabric_client 实例绑定做一起
    fabric_client.setCryptoSuite(crypto_suite);
    var	tlsOptions = {
    	trustedRoots: [],
    	verify: false
    };
    // 生成 ca 的client，赋给本模块的全局变量。之前的store什么的都与caclient 没有什么关系
    // be sure to change the http to https when the CA is running TLS enabled
    // 文档在这里： https://fabric-sdk-node.github.io/FabricCAServices.html#enroll
    fabric_ca_client = new Fabric_CA_Client('http://localhost:7054', null , '', crypto_suite);
    //fabric_ca_client = new Fabric_CA_Client('http://localhost:7054', tlsOptions , 'ca.example.com', crypto_suite);

    // 返回指定名字的 user，这里就是admin user。这个 admin 是哪个 org 的 admin 呢？
    // 因为后面这个true参数，所以不从内存里面同步拿，而是使用异步的思路来拿数据。
    // first check to see if the admin is already enrolled
    return fabric_client.getUserContext('admin', true);
}).then((user_from_store) => {
    // 第一次执行的时候，store里是不能取到任何数据的，接下来store里有了数据，总是能启动成功
    if (user_from_store && user_from_store.isEnrolled()) {
        console.log('Successfully loaded admin from persistence');
        admin_user = user_from_store;
        return null;
    } else {
        // 用全局的 ca_client 来登记一个admin user，直接提供用户名和密码。这一步必须有ca server 存在。
        // need to enroll it with CA server
        return fabric_ca_client.enroll({
          enrollmentID: 'magicliang',
          enrollmentSecret: '123456'
        }).then((enrollment) => {
          console.log('Successfully enrolled admin user "admin"');
          // 这里的 enrollment 是从ca server 里获取的。可以被认为是一个 ECert。
          // 把这个用户名，和特定的 msp id 和特定的 ECert 细节绑定起来，生成一个user object promise。这里就好像拿到一个证书，然后补填里面的姓名和 mspid 部分一样。
          // 可是为什么是 Org1MSP 呢？
          return fabric_client.createUser(
              {username: 'admin',
                  mspid: 'Org1MSP',
                  cryptoContent: { privateKeyPEM: enrollment.key.toBytes(), signedCertPEM: enrollment.certificate }
              });
        }).then((user) => {
          admin_user = user;
          // 把这个 user 当成当前client 的 user 上下文
          return fabric_client.setUserContext(admin_user);
        }).catch((err) => {
          console.error('Failed to enroll and persist admin. Error: ' + err.stack ? err.stack : err);
          throw new Error('Failed to enroll admin');
        });
    }
}).then(() => {
    console.log('Assigned the admin user to the fabric client ::' + admin_user.toString());
}).catch((err) => {
    console.error('Failed to enroll admin: ' + err);
});
