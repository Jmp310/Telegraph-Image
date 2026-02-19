export async function onRequest(context) {
    const { request, env, params } = context;
    const fileName = params.id;
    const fileId = fileName.split(".")[0];
    const ext = fileName.split('.').pop().toLowerCase();

    try {
        // 1. 获取 Telegram 文件真实路径
        const getFileUrl = `https://api.telegram.org/bot${env.TG_Bot_Token}/getFile?file_id=${fileId}`;
        const fileInfoRes = await fetch(getFileUrl);
        const fileInfo = await fileInfoRes.json();

        if (!fileInfo.ok) {
            // 兼容旧的 Telegraph 路径
            return fetch(`https://telegra.ph/file/${fileName}`);
        }

        const filePath = fileInfo.result.file_path;
        const finalUrl = `https://api.telegram.org/file/bot${env.TG_Bot_Token}/${filePath}`;

        // 2. 抓取文件原始流
        const response = await fetch(finalUrl);
        if (!response.ok) return response;

        // 3. 【最关键修复】手动重构 Headers，干掉强制下载头
        const newHeaders = new Headers();
        
        // 映射正确的图片类型，防止浏览器当成文件下载
        const mimeMap = {
            'gif': 'image/gif',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'webp': 'image/webp'
        };
        newHeaders.set('Content-Type', mimeMap[ext] || 'image/png');
        
        // 核心：强制改为 inline（预览）而非 attachment（下载）
        newHeaders.set('Content-Disposition', 'inline');
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Cache-Control', 'public, max-age=31536000');

        // 使用原本的响应流构造新响应
        return new Response(response.body, {
            status: 200,
            headers: newHeaders
        });

    } catch (e) {
        return new Response(e.message, { status: 500 });
    }
}
