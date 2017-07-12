#!/bin/sh

# In the context of a demo, we want to start some of the pvd
# related daemons and utilities

# This script is intended to be started on a host (at least,
# it offers host [aka non router] functionality)

# It supposes that the pvdd component (daemon + its additional
# utilities and binding package [the pvdd node one notably])
# have been installed. By default, the installation has been
# done under /usr/local

# Make sure to run any sudo command before starting this script
# (otherwise starting the pvdd will fail by waiting input
# on stdin)


cd ../pvdd || exit 1

PATH=/usr/local/sbin:$PATH
export PATH

nohup node ./tests/httpsServer.js >/dev/null 2>&1 &
nohup sudo pvdd >/dev/null 2>&1 &
nohup pvd-monitor -d >/dev/null 2>&1 &

cd ../pvd-demo
NODE_PATH=/usr/local/lib/node_modules nohup node ./pvd-html-client/pvdHttpServer.js >/dev/null 2>&1 &
