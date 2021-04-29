## webpack打包原理
- 首先，给项目安装webpack，通过`npx webpack`执行webpack
- 执行打包过程时，webpack会读取配置文件，默认为webpack.config,js，在配置文件中可以拿到入口文件的地址，从而拿到入口文件的内容
- 拿到入口文件的代码后，递归的去读取每个模块所以来的文件内容(代码)
- 将源码生成ast语法树，并遍历这棵树，对其进行转义，把代码转换成浏览器可以运行的代码
- 将转义后的ast树转化成代码并写入配置中的output文件

## 打包生成文件分析
首先我们准备一个测试文件，src目录结构如下：

![image.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/491830b0de5849f4812dad4afe78c26e~tplv-k3u1fbpfcp-watermark.image)

```javascript
// b.js
module.exports = 'bbbb';
```

```javascript
// a.js
let b = require('./base/b.js');
module.exports = b + 'aaaa';
```

```javascript
// index.js
let str = require('./a.js');
console.log(str);
```

- 执行`npx webpack`，看看打包生成的bundle.js(简易版，对注释等无用代码进行了删除)：
```javascript
(function (modules) {
  var installedModules = {};// 存放缓存模块
  function __webpack_require__(moduleId) {// 实现了一个require方法
    if (installedModules[moduleId]) {
      return installedModules[moduleId].exports;
    }// 判断是否在缓存中
    var module = (installedModules[moduleId] = {
      i: moduleId,
      l: false,
      exports: {},
    });// 不存在缓存的话,先缓存
    modules[moduleId].call(
      module.exports,
      module,
      module.exports,
      __webpack_require__
    );// 执行路径对应的代码块
    module.l = true;
    return module.exports;
  }
  return __webpack_require__((__webpack_require__.s = "./src/index.js"));
})({
  "./src/a.js": function (module, exports, __webpack_require__) {
    eval(
      "let b = __webpack_require__(/*! ./base/b.js */ \"./src/base/b.js\");\r\nmodule.exports = b + 'aaaa';\n\n//# sourceURL=webpack:///./src/a.js?"
    );
  },
  "./src/base/b.js": function (module, exports) {
    eval(
      "module.exports = 'bbbb';\n\n//# sourceURL=webpack:///./src/base/b.js?"
    );
  },
  "./src/index.js": function (module, exports, __webpack_require__) {
    eval(
      'let str = __webpack_require__(/*! ./a.js */ "./src/a.js");\r\nconsole.log(str);\n\n//# sourceURL=webpack:///./src/index.js?'
    );
  },
});
```

- 可以看出，打包后的内容是一个立即执行函数，而参数是一个个的对象，每个对象的key是依赖文件的路径，每个对象的value是一个函数，经过处理后的代码会作为参数传入eval函数中，eval函数会将传入的字符串当做 JavaScript 代码进行执行。
- 立即执行函数中，首先定义一个installedModules来存放缓存模块，接着声明一个__webpack_require__方法来实现require函数的功能，因为浏览器无法识别require。传递的参数为moduleId
- 在立即执行函数的最后会去执行__webpack_require__函数，并把入口模块路径传入
- 传入入口路径后，首先判断是否在缓存中，如果存在直接返回；如果不存在则存入缓存
- 接着通过对象，即文件路径，找到对应的代码块并执行。如果代码中继续引用了别的模块，则递归执行__webpack_require__

这里要额外多说一点，关于这个立即执行函数的参数中的value为什么使用eval。
这个与webpack的devtool配置有关，当你设置mode为development时，默认值为eval，也就是使用eval包裹代码去执行，这时这段代码会运行在一个临时的虚拟机环境中，然后通过浏览器可以认识的锚点，来定位打包后错误的位置 。
当设置mode为production时，devtool默认值为none，这是你再执行打包，打包后的结果，立即执行函数的参数里面，对象value值就是一个立即执行函数了。
设置devtool为其他值时，参数的value值也会不一样，这里就不再展开。

接下来我们就开始自己手动实现。
## 初始化
- 新建文件夹my-webpack，执行npm init初始化，在目录中新建一个名为bin的文件夹，在里面新建一个my-webpack.js，并在文件顶部配置以下代码，表示当前代码需要在node环境下执行:
```javascript
#! /usr/bin/env node
```

在package.json中添加一个bin命令，对应着上一步新建的文件my-webpack.js，并把value设置为要执行的文件:
```json
"bin": {
    "my-webpack": "./bin/my-webpack.js"
  }
```

- 在cmd执行`npm link`，将当前包链接到全局下并生成命令my-webpack，当你在全局执行my-webpack这个命令，就可以执行对应的文件
- 接着,新建一个测试文件test，使用`npm init`初始化，再使用npm link my-webpack 将全局的包映射到测试文件test中
- 执行npx my-webpack，就相当于执行了映射包的my-webpack.js文件
- 可以在my-webpack.js文件中写一个console.log('go')来测试是否初始化完成
## Compiler的实现
- 实现一个Compiler类，这个类的作用是传入webpack配置，并根据配置来实现解析和打包的过程。所以传入的参数为config，并在该类上创建一个run函数负责执行解析与打包。my-webpack.js文件如下:

```js
#! /usr/bin/env node
const path = require('path');

//拿到配置文件config
const config = require(path.resolve('webpack.config.js'));

const Compiler = require('../lib/Compiler');
const compiler = new Compiler(config);
compiler.run();//执行解析与打包
```

- 创建一个lib文件夹，这个文件夹的作用是放源码的，我们在文件夹中创建一个Compiler.js
- 拿到config后，把config保存到实例上，包括入口文件路径、依赖模块、工作路径
- 写一个run方法，执行两个函数，一个是buildModule，作用是解析代码模块，另一个是emitFile，作用是把解析后的文件导出
- buildModule传入两个参数，一个是入口文件的绝对路径，一个是判断是否为入口的布尔值，方便后续递归是做判断
- 首先拿到入口文件的源码source，这里可以抽出一个函数getSource，接着拿到入口的文件名，并声明一个parse函数，作用是解析源码，parse函数传入两个参数，一个是源码source，一个是源码的父级文件夹
```js
const fs = require("fs");
const path = require("path");

class Compiler {
  constructor(config) {
    this.config = config;
    // 需要保存入口文件
    this.entryId;
    // 需要保存所有的模块依赖
    this.modules = {};
    // 入口路径
    this.entry = config.entry;
    // 工作路径
    this.root = process.cwd();
  }
  getSource(modulePath) {
    return fs.readFileSync(modulePath, "utf8");
  }
  parse(source, parentPath) {

  }
  buildModule(modulePath, isEntry) {
    //执行并创建模块的依赖关系
    const source = this.getSource(modulePath);
    const moduleName = `./${path.relative(this.root, modulePath)}`;
    if(isEntry) {
      this.entryId = moduleName;//保存入口的文件名
    }
    const {sourceCode, dependencies} = this.parse(
      source,
      path.dirname(moduleName)
    );
  }
  emitFile() {
    // 发射一个打包后的文件
  }
  run() {
    this.buildModule(path.resolve(this.root, this.entry), true);
    this.emitFile();
  }
}
module.exports = Compiler;
```

- parse函数主要是靠AST语法树来进行源码的转义，这里需要安装一些库来使用，分别是babylon、@babel-traverse、@babel-types、@babel-generator。babylon作用是将源码转换成ast，babel-traverse的作用是遍历ast，babel-types的作用是将当前遍历的节点进行替换，babel-generator的作用将替换好的ast生成代码。
- 使用babylon的parse函数将源码source转换为ast，为了明确ast上有什么属性，我们可以访问https://astexplorer.net/， 可以看到这么一个对照:

![image.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/e762f79b3c7d4a2abd174386b8d6cdf2~tplv-k3u1fbpfcp-watermark.image)

- 实现parse函数代码如下：

```js
  parse(source, parentPath) {
    const ast = babylon.parse(source);// 将源码转换为ast
    let dependencies = [];// 存放依赖
    traverse(ast, {
      CallExpression(p){
        const node = p.node;
        if(node.callee.name === 'require') {
          node.callee.name = '__webpack_require__';// 将函数名改为__webpack_require__
          let moduleName = node.arguments[0].value;// 拿到模块的引用名
          moduleName = `${moduleName}${path.extname(moduleName) ? '' : '.js'}`;//如果有后缀,拼上
          moduleName = `./${path.join(parentPath, moduleName)}`
          dependencies.push(moduleName);
          node.arguments = [type.stringLiteral(moduleName)];// 把默认的ast的value改为moduleName
        };
      }
    });
    const sourceCode = generator(ast).code;// 将ast转为代码
    return {sourceCode, dependencies};
  };
```

- 同时在buildModule函数中递归加载引入的模块:

```js
  buildModule(modulePath, isEntry) {
    //执行并创建模块的依赖关系
    const source = this.getSource(modulePath);
    const moduleName = `./${path.relative(this.root, modulePath)}`;
    if(isEntry) {
      this.entryId = moduleName;//保存入口的文件名
    }
    const {sourceCode, dependencies} = this.parse(
      source,
      path.dirname(moduleName)
    );
    this.modules[moduleName] = sourceCode;// 把相对路径和模块中的内容一一对应
    dependencies.forEach(dep =>{// 引用模块的递归加载
      this.buildModule(path.join(this.root, dep), false);
    });
  };

```

通过前面分析webpack打包后的文件，可以看出立即执行函数的内容基本是固定的，可变的是入口文件路径和传入立即执行函数的参数。我们使用ejs来做模板生成代码。ejs模板如下：

```js
// main.ejs
(function (modules) {
  var installedModules = {};
  function __webpack_require__(moduleId) {
    if (installedModules[moduleId]) {
      return installedModules[moduleId].exports;
    }
    var module = (installedModules[moduleId] = {
      i: moduleId,
      l: false,
      exports: {},
    });
    modules[moduleId].call(
      module.exports,
      module,
      module.exports,
      __webpack_require__
    );
    module.l = true;
    return module.exports;
  }
  return __webpack_require__(__webpack_require__.s = "<%-entryId%>");
})
  ({
    <%for(let key in modules){%> 
      "<%-key%>":
      (function (module, exports, __webpack_require__) {
        eval(`<%-modules[key]%>`);
      }),
    <%}%>
  });
```

- 声明emitFile函数，实现生成文件的功能
- 在传入的配置中拿到输出文件的路径
- 拿到准备好的ejs代码模板
- 使用ejs的render方法，传入代码模板和参数，返回实际代码code
- 将输出信息储存在this.assets
- 将code写入输出文件中

```js
  emitFile() {
    // 发射一个打包后的文件
    const main = path.join(
      this.config.output.path,
      this.config.output.filename
    );// 输出文件的路径
    const templateStr = this.getSource(path.join(__dirname, 'main.ejs'));// 拿到ejs代码模板
    const code = ejs.render(templateStr, {
      entryId: this.entryId,
      modules: this.modules,
    });// 使用ejs的render方法，传入代码模板和参数
    this.assets = {};// 存储输出信息的对象
    this.assets[main] = code;
    fs.writeFileSync(main, this.assets[main]);
  }
```

Compiler.js的完整代码如下：

```js
const fs = require("fs");
const path = require("path");
const babylon = require("babylon");
const type = require("@babel/types");
const traverse = require("@babel/traverse").default;
const generator = require("@babel/generator").default;
const ejs = require("ejs");

class Compiler {
  constructor(config) {
    this.config = config;
    // 需要保存入口文件的路径
    this.entryId;
    // 需要保存所有的模块依赖
    this.modules = {};
    // 入口路径
    this.entry = config.entry;
    // 工作路径
    this.root = process.cwd();
  }
  getSource(modulePath) {
    return fs.readFileSync(modulePath, "utf8");
  }
  parse(source, parentPath) {
    const ast = babylon.parse(source); // 将源码转换为ast
    let dependencies = []; // 依赖的数组
    traverse(ast, {
      CallExpression(p) {
        const node = p.node;
        if (node.callee.name === "require") {
          node.callee.name = "__webpack_require__"; // 将函数名改为__webpack_require__
          let moduleName = node.arguments[0].value; // 拿到模块的引用名
          moduleName = `${moduleName}${path.extname(moduleName) ? "" : ".js"}`; //如果有后缀,拼上
          moduleName = `./${path.join(parentPath, moduleName)}`;
          dependencies.push(moduleName);
          node.arguments = [type.stringLiteral(moduleName)]; // 把默认的ast的value改为moduleName
        }
      },
    });

    const sourceCode = generator(ast).code; // 转换后的源码
    return { sourceCode, dependencies };
  }
  buildModule(modulePath, isEntry) {
    //执行并创建模块的依赖关系
    const source = this.getSource(modulePath);
    const moduleName = `./${path.relative(this.root, modulePath)}`;
    if (isEntry) {
      this.entryId = moduleName; //保存入口的文件名
    }
    const { sourceCode, dependencies } = this.parse(
      source,
      path.dirname(moduleName)
    );
    this.modules[moduleName] = sourceCode; // 把相对路径和模块中的内容一一对应
    dependencies.forEach((dep) => {
      // 引用模块的递归加载
      this.buildModule(path.join(this.root, dep), false);
    });
  }
  emitFile() {
    // 发射一个打包后的文件
    const main = path.join(
      this.config.output.path,
      this.config.output.filename
    );// 输出路径
    const templateStr = this.getSource(path.join(__dirname, 'main.ejs'));// 模板路径
    const code = ejs.render(templateStr, {
      entryId: this.entryId,
      modules: this.modules,
    });
    this.assets = {};
    this.assets[main] = code;
    fs.writeFileSync(main, this.assets[main]);
  }
  run() {
    this.buildModule(path.resolve(this.root, this.entry), true);
    this.emitFile();
  }
}
module.exports = Compiler;
```
