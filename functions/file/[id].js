export async function onRequest(context) {
    const {
        request,
        env,
        params,
    } = context;

    const url = new URL(request.url);
    const fileName = params.id;
    const isGif = fileName.toLowerCase().endsWith('.gif');
    
    let fileUrl = 'https://telegra.ph/' + url.pathname + url.search;
    
    // 如果是通过 Telegram Bot API 上传的长路径文件
    if (url.pathname.length > 39) { 
        const fileId = url.pathname.split(".")[0].split("/")[2];
        const filePath = await getFilePath(env, fileId);
        if (filePath) {
            fileUrl = `https://api.telegram.org/file/bot${env.TG_Bot_Token}/${filePath}`;
        }
    }

    // 获取原始响应
    const originalResponse = await fetch(fileUrl, {
        method: request.method,
        headers: request.headers,
    });

    if (!originalResponse.ok) return originalResponse;

    // --- 核心修复：重新包装响应头 ---
    let response = new Response(originalResponse.body, originalResponse);
    
    // 强制设置 Content-Type，解决 GIF 无法显示和下载损坏问题
    if (isGif) {
        response.headers.set('Content-Type', 'image/gif');
    } else if (fileName.toLowerCase().endsWith('.png')) {
        response.headers.set('Content-Type', 'image/png');
    } else if (fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg')) {
        response.headers.set('Content-Type', 'image/jpeg');
    }
    
    // 设置缓存
    response.headers.set('Cache-Control', 'public, max-age=31536000');
    // --- 修复结束 ---

    // 以下保留你原有的管理后台、KV 记录和审核逻辑
    const isAdmin = request.headers.get('Referer')?.includes(`${url.origin}/admin`);
    if (isAdmin) return response;

    if (!env.img_url) return response;

    let record = await env.img_url.getWithMetadata(params.id);
    if (!record || !record.metadata) {
        record = {
            metadata: {
                ListType: "None",
                Label: "None",
                TimeStamp: Date.now(),
                liked: false,
                fileName: params.id,
                fileSize: 0,
            }
        };
        await env.img_url.put(params.id, "", { metadata: record.metadata });
    }

    const metadata = record.metadata;

    if (metadata.ListType === "White") {
        return response;
    } else if (metadata.ListType === "Block" || metadata.Label === "adult") {
        const referer = request.headers.get('Referer');
        const redirectUrl = referer ? "https://static-res.pages.dev/teleimage/img-block-compressed.png" : `${url.origin}/block-img.html`;
        return Response.redirect(redirectUrl, 302);
    }

    if (env.WhiteList_Mode === "true") {
        return Response.redirect(`${url.origin}/whitelist-on.html`, 302);
    }

    // 内容审核逻辑
    if (env.ModerateContentApiKey && metadata.Label === "None") {
        try {
            const moderateUrl = `https://api.moderatecontent.com/moderate/?key=${env.ModerateContentApiKey}&url=${fileUrl}`;
            const moderateResponse = await fetch(moderateUrl);
            if (moderateResponse.ok) {
                const moderateData = await moderateResponse.json();
                if (moderateData && moderateData.rating_label) {
                    metadata.Label = moderateData.rating_label;
                    await env.img_url.put(params.id, "", { metadata });
                    if (moderateData.rating_label === "adult") {
                        return Response.redirect(`${url.origin}/block-img.html`, 302);
                    }
                }
            }
        } catch (error) {
            console.error("Moderation error:", error.message);
        }
    }

    return response;
}

async function getFilePath(env, file_id) {
    try {
        const url = `https://api.telegram.org/bot${env.TG_Bot_Token}/getFile?file_id=${file_id}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const responseData = await res.json();
        return responseData.ok ? responseData.result.file_path : null;
    } catch (error) {
        return null;
    }
}
