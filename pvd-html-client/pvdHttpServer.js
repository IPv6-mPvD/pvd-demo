#!/usr/bin/env node

/*
	Copyright 2017 Cisco

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

		http://www.apache.org/licenses/LICENSE-2.0

	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
*/
/*
 * This script starts a server that can be used to monitor pvds via a browser
 */
const Net = require("net");
const http = require('http');
const os = require("os");
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;

var WebSocketServer = require('websocket').server;

var pvdd = require("pvdd");

var pvdEmitter = new EventEmitter();

var verbose = false;

var allPvd = {};
var currentPvdList = [];

var Port = parseInt(process.env["PVDD_PORT"]) || 10101;

function dlog(s) {
	if (verbose) {
		console.log(s);
	}
}

/*
 * Regular connection related functions. The regular connection will be used to send
 * queries (PvD list and attributes) and to receive replies/notifications
 */
var pvddCnx = pvdd.connect({ autoReconnect : true, port : Port });

pvddCnx.on("connect", function() {
	pvddCnx.getList();
	pvddCnx.subscribeNotifications();
	pvddCnx.subscribeAttribute("*");
	console.log("Regular connection established with pvdd");
});

pvddCnx.on("error", function(err) {
	dlog("Can not connect to pvdd on port " +
		Port + " (" + err.message + ")");
	allPvd = {};
});

pvddCnx.on("pvdList", function(pvdList) {
	pvdList.forEach(function(pvdId) {
		if (allPvd[pvdId] == null) {
			/*
			 * New Pvd : create an entry
			 */
			allPvd[pvdId] = { pvd : pvdId, attributes : {} };
		}
		/*
		 * Always retrieve its attributes
		 */
		pvddCnx.getAttributes(pvdId);
	});
	/*
	 * Always notify the new pvd list, even if it has not changed
	 */
	currentPvdList = pvdList;
	pvdEmitter.emit("pvdList", currentPvdList);
	dlog("New pvd list : " + JSON.stringify(allPvd, null, 4));
});

pvddCnx.on("delPvd", function(pvdId) {
	allPvd[pvdId] = null;
});

pvddCnx.on("pvdAttributes", function(pvdId, attrs) {
	/*
	 * UpdateAttributes : update the internal attributes structure for a
	 * given pvdId and notifies all websocket connections. This function
	 * is called when the attributes for the PvD have been received
	 */
	dlog("Attributes for " + pvdId + " = " + JSON.stringify(attrs, null, 8));

	if (allPvd[pvdId] != null) {
		allPvd[pvdId].attributes = attrs;

		pvdEmitter.emit("pvdAttributes", {
			pvd : pvdId,
			pvdAttributes : attrs
		});
	}
});

/*
 * Options parsing
 */
var Help = false;
var PortNeeded = false;
var FileNeeded  = false;
var HttpPort = 8080;
var FileHtml = __dirname + "/pvdClient.html";

process.argv.forEach(function(arg) {
	if (arg == "-h" || arg == "--help") {
		Help = true;
	} else
	if (arg == "-v" || arg == "--verbose") {
		verbose = true;
	} else
	if (arg == "-p" || arg == "--port") {
		PortNeeded = true;
	} else
	if (arg == "-f" || arg == "--file") {
		FileNeeded = true;
	} else
	if (PortNeeded) {
		HttpPort = arg;
		PortNeeded = false;
	} else
	if (FileNeeded) {
		FileHtml = arg;
		FileNeeded = false;
	}
});

if (Help) {
	console.log("pvdHttpServer [-h|--help] <option>*");
	console.log("with option :");
	console.log("\t-v|--verbose : outputs extra logs during operation");
	console.log("\t-p|--port #  : http port to listen on (default 8080)");
	console.log("\t-f|--file <path.html> : static file to serve");
	process.exit(0);
}

console.log("Listening on http port " + HttpPort + ", pvdd port " + Port);
console.log("Hostname : " + os.hostname());
console.log("Serving static file : " + FileHtml);

/*
 * =================================================
 * Server part : it provides web clients a regular
 * http as well as a websocket connection to retrieve
 * a static page (via http) and live notifications
 * via the websocket (for PvD related informations)
 */
var server = http.createServer(function(req, res) {
	var page = fs.readFileSync(FileHtml);
	res.writeHead(200);
	res.end(page);
});

server.listen(HttpPort, "::");

var ws = new WebSocketServer({ httpServer : server, autoAcceptConnections: true });

function Send2Client(conn, o) {
	conn.sendUTF(JSON.stringify(o));
}

ws.on('connect', function(conn) {
	console.log("New websocket client");

	Send2Client(conn, {
		what : "hostname",
		payload : { hostname : os.hostname() }
	});

	function pvdList(ev) {
		Send2Client(conn, {
			what : "pvdList",
			payload : { pvdList : ev }
		});
	}

	function pvdAttributes(ev) {
		Send2Client(conn, {
			what : "pvdAttributes",
			payload : {
				pvd : ev.pvd,
				pvdAttributes : ev.pvdAttributes
			}
		});
	}

	function hostDate(ev) {
		Send2Client(conn, {
			what : "hostDate",
			payload : { hostDate : ev }
		});
	}

	pvdEmitter.on("pvdList", pvdList);
	pvdEmitter.on("pvdAttributes", pvdAttributes);
	pvdEmitter.on("hostDate", hostDate);

	conn.on("message", function(m) {
		if (m.type == "utf8") {
			HandleMessage(conn, m.utf8Data);
		}
	});
	conn.on("close", function() {
		pvdEmitter.removeListener("pvdList", pvdList);
		pvdEmitter.removeListener("pvdAttributes", pvdAttributes);
		pvdEmitter.removeListener("hostDate", hostDate);
		console.log("Connection closed");
	});

});

function HandleMessage(conn, m) {
	if (m == "PVD_GET_LIST") {
		Send2Client(conn, {
			what : "pvdList",
			payload : {
				pvdList : currentPvdList
			}
		});
	} else
	if (m == "PVD_GET_ATTRIBUTES") {
		for (var key in allPvd) {
			if ((p = allPvd[key]) != null) {
				Send2Client(conn, {
					what : "pvdAttributes",
					payload : {
						pvd : p.pvd,
						pvdAttributes : p.attributes
					}
				});
			}
		};
	}
}

function SendDate() {
	var now = new Date(Date.now());
	pvdEmitter.emit("hostDate", now.toISOString());
	setTimeout(SendDate, 5000);
}

SendDate();

/* ex: set ts=8 noexpandtab wrap: */
