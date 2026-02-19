import { errorHandling, telemetryData } from "./utils/middleware";

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const clonedRequest = request.clone();
        const formData = await clonedRequest.formData();

        await errorHandling(context);
        telemetryData(context);

        const uploadFile = formData.get('file');
        if (!uploadFile) {
            throw new Error('No file uploaded');
        }

        const fileName = uploadFile.name;
        const fileExtension = fileName.split('.').pop().toLowerCase();

        const telegramFormData = new FormData();
        telegramFormData.append("chat_id", env.TG_Chat_ID);

        let apiEndpoint;
        // 强制：GIF 必须作为 document 上传以保留动图属性
        if (fileExtension === 'gif') {
            telegramFormData.append("document", uploadFile);
            apiEndpoint = 'sendDocument';
        } else if (uploadFile.type.startsWith('image/')) {
            telegramFormData.append("photo", uploadFile);
            apiEndpoint = 'sendPhoto';
        } else {
            telegramFormData.append("document", uploadFile);
            apiEndpoint = 'sendDocument';
        }

        const result = await sendToTelegram(telegramFormData, apiEndpoint, env);
        if (!result.success) throw new Error(result.error);

        const fileId = getFileId(result.data);
        if (!fileId) throw new Error('Failed to get file ID');

        // 保存 KV 记录
        if (env.img_url) {
            await env.img_url.put(`${fileId}.${fileExtension}`, "", {
                metadata: {
                    TimeStamp: Date.now(),
                    ListType: "None", Label: "None", liked: false,
                    fileName: fileName, fileSize: uploadFile.size,
                }
            });
        }

        return new Response(
            JSON.stringify([{ 'src': `/file/${fileId}.${fileExtension}` }]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}

function getFileId(response) {
    if (!response.ok || !response.result) return null;
    const res = response.result;
    if (res.photo) return res.photo[res.photo.length - 1].file_id;
    if (res.document) return res.document.file_id;
    return null;
}

async function sendToTelegram(formData, apiEndpoint, env) {
    const apiUrl = `https://api.telegram.org/bot${env.TG_Bot_Token}/${apiEndpoint}`;
    const response = await fetch(apiUrl, { method: "POST", body: formData });
    const responseData = await response.json();
    return { success: response.ok, data: responseData, error: responseData.description };
}
