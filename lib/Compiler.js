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
