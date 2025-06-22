export async function generateOutline(transcription, env) {
	// 使用 Workers AI 生成回答
	const response = await env.AI.run("@hf/thebloke/neural-chat-7b-v3-1-awq", {
		messages: [
			{
				role: "system",
				content: "請用正體中文把以下內容整理出來，重點整理。"
			},
			{
				role: "user",
				content: transcription
			}
		]
	});
	console.log(response.response);
	return response.response;
}