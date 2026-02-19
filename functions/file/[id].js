export async function onRequest(context) {
    const { request, env, params } = context;
    const url = new URL(request.url);
    
    // 从参数中提取文件名，例如 "AgACAgE...gif"
    const fileName = params.id;
    const fileId = fileName.split(".")[0];
    const ext = fileName.split('.').pop().toLowerCase();

    try {
        // 1. 获取 Telegram 文件真实路径
        const getFileUrl = `https://api.telegram.org/bot${env.TG_Bot_Token}/getFile?file_id=${fileId}`;
        const fileInfoRes = await fetch(getFileUrl);
        const fileInfo = await fileInfoRes.json();

        if (!fileInfo.ok) {
            // 如果 Bot 接口找不到，尝试回退到 Telegraph 原始地址（兼容旧图）
            return fetch(`https://telegra.ph/file/${fileName}`);
        }

        const filePath = fileInfo.result.file_path;
        const finalUrl = `https://api.telegram.org/file/bot${env.TG_Bot_Token}/${filePath}`;

        // 2. 抓取文件流
        const response = await fetch(finalUrl);

        // 3. 【最关键】构造全新的 Headers，彻底干掉“直接下载”的行为
        const newHeaders = new Headers(response.headers);
        
        // 映射 MIME 类型
        const mimeTypes = {
            'gif': 'image/gif',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'webp': 'image/webp'
        };

        if (mimeTypes[ext]) {
            newHeaders.set('Content-Type', mimeTypes[ext]);
        } else {
            newHeaders.set('Content-Type', 'image/gif'); // 默认兜底为 gif
        }

        // 移除可能导致强制下载的 Header (如果 Telegram 返回了的话)
        newHeaders.delete('Content-Disposition');
        
        // 允许跨域，方便 Markdown 预览
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Cache-Control', 'public, max-age=31536000');

        return new Response(response.body, {
            status: response.status,
            headers: newHeaders,
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
