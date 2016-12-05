var template = require('../../node/template.js');
//console.log(template);
template.config('base', __dirname); // 设置模板根目录，默认为引擎所在目录
template.config('compress', false); // 压缩输出
template.config('escape', false); // xss过滤

var data = {
    title: '标签',
    user: { name: "midday", birthYear: "1990", sex: "男" },
    list: ['文艺', '博客', '摄影', '电影', '民谣', '旅行', '吉他']
};

var render = template('macro-tpl');

var html = render(data);

console.log(html);
