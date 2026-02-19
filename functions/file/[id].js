export async function onRequest(context) {
    const { env, params } = context;
    const fileName = params.id;
    const fileId = fileName.split(".")[0];
    const ext = fileName.split('.').pop().toLowerCase();

    try {
        // 1. 获取 Telegram 文件真实下载路径
        const fileInfoRes = await fetch(`https://api.telegram.org/bot${env.TG_Bot_Token}/getFile?file_id=${fileId}`);
        const fileInfo = await fileInfoRes.json();

        if (!fileInfo.ok) {
            // 如果 ID 失效，回退到原始 Telegraph 路径
            return fetch(`https://telegra.ph/file/${fileName}`);
        }

        const filePath = fileInfo.result.file_path;
        const finalUrl = `https://api.telegram.org/file/bot${env.TG_Bot_Token}/${filePath}`;

        // 2. 抓取原始数据并转为 Buffer
        const response = await fetch(finalUrl);
        const buffer = await response.arrayBuffer();

        // 3. 构造全新的响应，强制浏览器预览
        const mimeTypes = {
            'gif': 'image/gif',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'webp': 'image/webp'
        };

        return new Response(buffer, {
            headers: {
                "Content-Type": mimeTypes[ext] || "image/gif",
                "Content-Disposition": "inline", // 确保是在线预览
                "Cache-Control": "public, max-age=31536000",
                "Access-Control-Allow-Origin": "*",
                "Content-Length": buffer.byteLength.toString()
            }
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
