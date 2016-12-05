var fs = require('fs');
var path = require('path');

module.exports = function (template) {
	//macro存储的变量，格式：{"macroName":[macroData,macroContent],"macroName":[macroData,macroContent]}
    var macroStore = template.macroStore = {};

	var cacheStore = template.cache;
	var defaults = template.defaults;
	var rExtname;

	// 提供新的配置字段
	defaults.base = '';
	defaults.extname = '.html';
	defaults.encoding = 'utf-8';

	 /**
     * 解析macro(宏)的方法
     * @name    template.utils.$macro
     * @param   {String}    模板字符串
     * @param   {String}    macro(宏)的实参
     * @param   {Object}    模板的全量数据，挂载到macroData中，便于macro(宏)内部引用
     *
     * @return  {String}  macro(宏)编译完后的字符串
     */
    template.utils.$macro = function(macroName, args, rootData) {
    	var ROOT_DATA_KEY = "$rootData";
        var macroData = {};
        var macroArgs = args.split(' ');
        macroArgs.forEach(function(macroArg) {
            var macroArgSplit = macroArg.split('=');
            var argKey = macroArgSplit[0];
            var argValueStr = macroArgSplit[1];

            //将对象或数组字符串转为标准的json字符串，增加容错性
            if(typeof argValueStr === "string" && /^\[|\{/.test(argValueStr)){
            	argValueStr = argValueStr.replace(/,\}/g,"}").replace(/\{([^\"]+?):/g,'{\"$1\":').replace(/\,([^\"]+?):/g,',\"$1\":');
            }
            var argValue = JSON.parse(argValueStr);

            //引用动态数据语法，以$打头，例如：$title、$user.id
            if (typeof argValue === 'string' && /^\$/.test(argValue)) {
                argValue = argValue.replace('$', '');
                var methodNameSplit = argValue.split('.');
                methodNameSplit.forEach(function(methodName, index) {
                    if (index === 0) {
                        argValue = rootData[methodName];
                    } else {
                        argValue = argValue[methodName];
                    }
                });
            }
            macroData[argKey] = argValue;
        });

        var defaultMacroData = macroStore[macroName][0];
        var macroContent = macroStore[macroName][1];
        for (var name in defaultMacroData) {
            if (macroData[name] !== undefined) {
                defaultMacroData[name] = macroData[name];
            }
        }

        defaultMacroData[ROOT_DATA_KEY] = rootData;
        return template.compile(macroContent)(defaultMacroData);
    };

    /**
     * 处理宏定义，作用：(1)将macro定义部分替换为空(2)将macro数据和宏内容存储到macroStore中
     * @name    handleMacroDeclare
     * @param   {String}    模板字符串
     *
     * @return  {String}  去除macro声明后的模板代码
     */
    function handleMacroDefine(source) {
        var macroRegExp = /(\{\{macro)([\s\S]*?)(\{\{\/macro\}\})/mg;
        var macroMetaRegExp = /(\{\{macro)([\s\S]*?)(\}\})/mg;
        return source.replace(macroRegExp, function(macro) {
            var macroName;
            var macroContent;
            var macroData = {};
            macroContent = macro.replace(macroMetaRegExp, function(macroMeta) {
                macroMeta = macroMeta.replace('{{macro:', '').replace('}}', '').trim();
                var macroMetaSplit = macroMeta.split(' ');
                macroName = macroMetaSplit[0];

                if (!macroStore[macroName]) {
                    var macroArgs = macroMetaSplit.slice(1);
                    macroArgs.forEach(function(macroArg, index) {
                        var macroArgSplit = macroArg.split('=');
                        var argKey = macroArgSplit[0];
                        var argValue = '';
                        if (argKey) {
                            if (macroArgSplit.length === 2) {
                                argValue = JSON.parse(macroArgSplit[1]);
                            }
                            macroData[argKey] = argValue;
                        }
                    });
                }

                return '';
            }).replace('{{/macro}}', '');

            if (!macroStore[macroName]) {
                macroStore[macroName] = [macroData, macroContent];
            }
            return '';
        });
    }

	function compileFromFS(filename) {
		// 加载模板并编译
		var source = template.readTemplate(filename);
		// 处理宏定义，作用：(1)将macro定义部分替换为空(2)将macro数据和宏内容存储到macroStore中
        source = handleMacroDefine(source);

		if (typeof source === 'string') {
			return template.compile(source, {
				filename: filename
			});
		}
	}

	// 重写引擎编译结果获取方法
	template.get = function (filename) {
		
	    var fn;


	    if (cacheStore.hasOwnProperty(filename)) {
	        // 使用内存缓存
	        fn = cacheStore[filename];
	    } else {
			fn = compileFromFS(filename);

			//暂时注释掉by midday
		    // if (fn) {
			   //  var watcher = fs.watch(filename + defaults.extname);

			   //  // 文件发生改变，重新生成缓存
			   //  // TODO： 观察删除文件，或者其他使文件发生变化的改动
			   //  watcher.on('change', function (event) {
				  //   if (event === 'change') {
					 //    cacheStore[filename] = compileFromFS(filename);
				  //   }
			   //  });
		    // }
	    }

	    return fn;
	};

	
	template.readTemplate = function(id) {
	    id = path.join(defaults.base, id + defaults.extname);
	    
	    if (id.indexOf(defaults.base) !== 0) {
	        // 安全限制：禁止超出模板目录之外调用文件
	        throw new Error('"' + id + '" is not in the template directory');
	    } else {
	        try {
                var source = fs.readFileSync(id, defaults.encoding);
	            return source;
	        } catch (e) {}
	    }
	};


	// 重写模板`include``语句实现方法，转换模板为绝对路径
	template.utils.$include = function (filename, data, from) {
	    
	    from = path.dirname(from);
	    filename = path.join(from, filename);
	    
	    return template.renderFile(filename, data);
	}


	// express support
	template.__express = function (file, options, fn) {

	    if (typeof options === 'function') {
	        fn = options;
	        options = {};
	    }


		if (!rExtname) {
			// 去掉 express 传入的路径
			rExtname = new RegExp((defaults.extname + '$').replace(/\./g, '\\.'));
		}


	    file = file.replace(rExtname, '');

	    options.filename = file;
	    fn(null, template.renderFile(file, options));
	};


	return template;
}