import { errorHandling, telemetryData } from "./utils/middleware";

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const clonedRequest = request.clone();
        const formData = await clonedRequest.formData();
        await errorHandling(context);
        telemetryData(context);

        const uploadFile = formData.get('file');
        if (!uploadFile) throw new Error('No file uploaded');

        const fileName = uploadFile.name;
        const fileExtension = fileName.split('.').pop().toLowerCase();
        const telegramFormData = new FormData();
        telegramFormData.append("chat_id", env.TG_Chat_ID);

        let apiEndpoint;
        // 强制 GIF 走 document 接口，防止转为静态 JPG
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

        const apiUrl = `https://api.telegram.org/bot${env.TG_Bot_Token}/${apiEndpoint}`;
        const res = await fetch(apiUrl, { method: "POST", body: telegramFormData });
        const result = await res.json();

        if (!result.ok) throw new Error(result.description);

        const fileId = result.result.document ? result.result.document.file_id : 
                       (result.result.photo ? result.result.photo[result.result.photo.length - 1].file_id : null);

        if (env.img_url) {
            await env.img_url.put(`${fileId}.${fileExtension}`, "", {
                metadata: { TimeStamp: Date.now(), ListType: "None", Label: "None", liked: false, fileName, fileSize: uploadFile.size }
            });
        }

        return new Response(JSON.stringify([{ 'src': `/file/${fileId}.${fileExtension}` }]), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
