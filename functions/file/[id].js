export async function onRequest(context) {
    const {
        request,
        env,
        params,
    } = context;

    const url = new URL(request.url);
    const fileName = params.id;
    const fileId = fileName.split(".")[0]; // 获取 ID 部分
    
    // 默认路径（Telegraph 原始路径）
    let fileUrl = 'https://telegra.ph' + url.pathname + url.search;

    try {
        // 1. 判断是否为 Bot 上传的长 ID (长度通常 > 39)
        if (url.pathname.split("/")[2]?.length > 39) {
            const filePath = await getFilePath(env, fileId);
            if (filePath) {
                fileUrl = `https://api.telegram.org/file/bot${env.TG_Bot_Token}/${filePath}`;
            }
        }

        // 2. 获取原始响应
        const originalResponse = await fetch(fileUrl, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0",
            }
        });

        if (!originalResponse.ok) return originalResponse;

        // 3. 【关键修改】重新构造 Response 对象，确保二进制流完整
        const body = await originalResponse.arrayBuffer();
        const response = new Response(body, {
            status: originalResponse.status,
            statusText: originalResponse.statusText,
        });

        // 4. 强制设置正确的 MIME 类型
        const ext = fileName.split('.').pop().toLowerCase();
        const mimeTypes = {
            'gif': 'image/gif',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'webp': 'image/webp'
        };
        
        if (mimeTypes[ext]) {
            response.headers.set('Content-Type', mimeTypes[ext]);
        }
        
        response.headers.set('Cache-Control', 'public, max-age=31536000');
        response.headers.set('Access-Control-Allow-Origin', '*');

        // --- 以下是你的原版管理逻辑（KV 记录等） ---
        const isAdmin = request.headers.get('Referer')?.includes(`${url.origin}/admin`);
        if (isAdmin) return response;
        if (!env.img_url) return response;

        let record = await env.img_url.getWithMetadata(params.id);
        if (!record || !record.metadata) {
            const metadata = {
                ListType: "None", Label: "None", TimeStamp: Date.now(),
                liked: false, fileName: params.id, fileSize: 0,
            };
            await env.img_url.put(params.id, "", { metadata });
        } else if (record.metadata.ListType === "Block" || record.metadata.Label === "adult") {
            return Response.redirect(`${url.origin}/block-img.html`, 302);
        }

        return response;

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

async function getFilePath(env, file_id) {
    try {
        const url = `https://api.telegram.org/bot${env.TG_Bot_Token}/getFile?file_id=${file_id}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.ok ? data.result.file_path : null;
    } catch (error) {
        return null;
    }
}
