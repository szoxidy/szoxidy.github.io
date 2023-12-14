fetch('https://asset.szoxidy.com/web/js/runtime.js', {
    method: 'GET',
    mode: 'cors', // 设置为 'cors' 类型的请求
    credentials: 'include', // 如果需要发送凭据，比如 cookies
    headers: {
        'Referer': 'https://blog.szoxidy.com/', // 可能需要添加 referer 头信息
        // 其他可能需要的头信息
    },
})
    .then(response => {
        // 处理响应
    })
    .catch(error => {
        // 处理错误
    });
