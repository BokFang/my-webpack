#! /usr/bin/env node

const path = require('path');

//拿到配置文件config
const config = require(path.resolve('webpack.config.js'));

const Compiler = require('../lib/Compiler');
const compiler = new Compiler(config);
compiler.run();//执行解析与打包