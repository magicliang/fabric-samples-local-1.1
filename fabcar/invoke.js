'use strict';
/*
* Copyright IBM Corp All Rights Reserved
*
* SPDX-License-Identifier: Apache-2.0
*/
/*
 * Chaincode Invoke
 */

var Fabric_Client = require('fabric-client');
var path = require('path');
var util = require('util');
var os = require('os');

//
var fabric_client = new Fabric_Client();

// setup the fabric network
var channel = fabric_client.newChannel('mychannel');
var peer = fabric_client.newPeer('grpc://localhost:7051');
channel.addPeer(peer);
// 比 query 多出来的地方之一，有了 orderer 的需求。
var order = fabric_client.newOrderer('grpc://localhost:7050')
channel.addOrderer(order);

var member_user = null;
var store_path = path.join(__dirname, 'hfc-key-store');
console.log('Store path:'+store_path);
var tx_id = null;

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

	// 先获取到 user object 再讲其他。
	// get the enrolled user from persistence, this user will sign all requests
	return fabric_client.getUserContext('user1', true);
}).then((user_from_store) => {
	if (user_from_store && user_from_store.isEnrolled()) {
		console.log('Successfully loaded user1 from persistence');
		member_user = user_from_store;
	} else {
		throw new Error('Failed to get user1.... run registerUser.js');
	}

	// 本地生成一个transaction id，而不用在链上生成。
	// get a transaction id object based on the current user assigned to fabric client
	tx_id = fabric_client.newTransactionID();
	console.log("Assigning transaction_id: ", tx_id._transaction_id);

	// createCar chaincode function - requires 5 args, ex: args: ['CAR12', 'Honda', 'Accord', 'Black', 'Tom'],
	// changeCarOwner chaincode function - requires 2 args , ex: args: ['CAR10', 'Dave'],
	// must send the proposal to endorsing peers
	// var request = {
	// 	//targets: let default to the peer assigned to the client
	// 	chaincodeId: 'fabcar',
	// 	fcn: '',
	// 	args: [''],
	// 	chainId: 'mychannel',
	// 	txId: tx_id
	// };

	// 默认的request是为空的，我们这里直接抄教程的 request 生成体
	var request = {
  		// targets: let default to the peer assigned to the client
  		chaincodeId: 'fabcar',
  		// 这个 createCar 可以重复调用，是幂等的。
  		fcn: 'createCar',
  		args: ['CAR10', 'Chevy', 'Volt', 'Red', 'Nick'],
  		chainId: 'mychannel',
  		// 这个地方就已经把 tx_id 与 proposal 绑定起来了。
  		txId: tx_id
	};
	// 1 先发送 proposal
	// 不用一个一个发送 proposal，由 channel 对象来广播。
	// send the transaction proposal to the peers
	return channel.sendTransactionProposal(request);
}).then((results) => {
	var proposalResponses = results[0];
	var proposal = results[1];
	let isProposalGood = false;
	if (proposalResponses && proposalResponses[0].response &&
		proposalResponses[0].response.status === 200) {
			isProposalGood = true;
			console.log('Transaction proposal was good, tx_id is: ' + tx_id._transaction_id);
		} else {
			// 看起来这里完全是由 http 的状态来确定 transaction proposal 的状态的
			console.error('Transaction proposal was bad');
		}
	if (isProposalGood) {
		console.log(util.format(
			'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s"',
			proposalResponses[0].response.status, proposalResponses[0].response.message));

		// build up the request for the orderer to have the transaction committed
		var request = {
			proposalResponses: proposalResponses,
			proposal: proposal
		};

		// set the transaction listener and set a timeout of 30 sec
		// if the transaction did not get committed within the timeout period,
		// report a TIMEOUT status
		var transaction_id_string = tx_id.getTransactionID(); //Get the transaction ID string to be used by the event processing
		// 到目前为止 tx_id.getTransactionID() == tx_id._transaction_id
		console.log('transaction_id_string is: ' + transaction_id_string);
		var promises = [];

		// 2 再发送 transaction。 
		var sendPromise = channel.sendTransaction(request);
		// 第一个promise，transaction 发送的promise
		promises.push(sendPromise); //we want the send transaction first, so that we know where to check status

		// 有 user 才可以用 eventhub。
		// get an eventhub once the fabric client has a user assigned. The user
		// is required bacause the event registration must be signed
		let event_hub = fabric_client.newEventHub();
		// 只监听一个 peer 的event。
		event_hub.setPeerAddr('grpc://localhost:7053');

		// 第二个 promise，监听刚才那个特殊的 transaction 号的 transaction event。
		// using resolve the promise so that result status may be processed
		// under the then clause rather than having the catch clause process
		// the status
		let txPromise = new Promise((resolve, reject) => {
			// 时间超时了直接断掉 event_hub。这里类似 golang 中的 defer。
			let handle = setTimeout(() => {
				event_hub.disconnect();
				resolve({event_status : 'TIMEOUT'}); //we could use reject(new Error('Trnasaction did not complete within 30 seconds'));
			}, 3000);
			event_hub.connect();
			event_hub.registerTxEvent(transaction_id_string, (tx, code) => {
				// this is the callback for transaction event status
				// first some clean up of event listener
				// clearTimeout() 方法可取消由 setTimeout() 方法设置的 timeout。它的参数对象就是 setTimeout 留下的句柄。
				clearTimeout(handle);
				// 不管处理结果是什么，eventhub 都手动当场解开事件监听，然后到eventhub的连接。而不是等timeout了。
				event_hub.unregisterTxEvent(transaction_id_string);
				event_hub.disconnect();

				// now let the application know what happened
				var return_status = {event_status : code, tx_id : transaction_id_string};
				if (code !== 'VALID') {
					console.error('The transaction was invalid, code = ' + code);
					resolve(return_status); // we could use reject(new Error('Problem with the tranaction, event status ::'+code));
				} else {
					// 这个 event 也没什么多余的状态可言，正确的结果就是被 commit 到某个peer上。从这里看来，每一个 eventhub 只可以连接一个 peer。
					console.log('The transaction has been committed on peer ' + event_hub._ep._endpoint.addr);
					resolve(return_status);
				}
			}, (err) => {
				//this is the callback if something goes wrong with the event registration or processing
				reject(new Error('There was a problem with the eventhub ::'+err));
			});
		});
		promises.push(txPromise);

		return Promise.all(promises);
	} else {
		console.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
		throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
	}
// 这里把两个 promise 这样串联起来解真的很丑。只有两个 promise 都 resolve 了，才能走到这一步。
}).then((results) => {
	console.log('Send transaction promise and event listener promise have completed');
	// check the results in the order the promises were added to the promise all list
	if (results && results[0] && results[0].status === 'SUCCESS') {
		console.log('Successfully sent transaction to the orderer.');
	} else {
		console.error('Failed to order the transaction. Error code: ' + response.status);
	}

	if(results && results[1] && results[1].event_status === 'VALID') {
		console.log('Successfully committed the change to the ledger by the peer');
	} else {
		console.log('Transaction failed to be committed to the ledger due to ::'+results[1].event_status);
	}
}).catch((err) => {
	console.error('Failed to invoke successfully :: ' + err);
});
