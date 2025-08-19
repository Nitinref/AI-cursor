import 'dotenv/config';
import { OpenAI } from "openai";
import fs from 'fs';
import { exec } from 'child_process';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Make sure to set this in .env
});

async function getWeatherCity(cityname = " ") {
  const url = `https://wttr.in/${cityname.toLowerCase()}?format=%C+%t`;
  const { data } = await axios.get(url, { responseType: 'text' });
  return `The current weather of ${cityname} is ${data}`;
}

async function executeCommand(cmd = '') {
  return new Promise((res) => {
    exec(cmd, (error, data) => {
      if (error) return res(`error running command: ${error}`);
      res(data);
    });
  });
}

const TOOL_MAP = {
  getWeatherCity,
  executeCommand
};

async function main() {
  const SYSTEM_PROMPT = `
You are an AI assistant that must respond **strictly in JSON** with one step: START, THINK, TOOL, OBSERVE, or OUTPUT.
You can use these tools: 
- getWeatherCity(city:string)
- executeCommand(command:string) for filesystem commands (mkdir, fs.writeFileSync, etc.)

Rules:
- Always THINK multiple steps before OUTPUT.
- Wait for OBSERVE after TOOL call.
- Check where is problem comming and try to solve it end to end until the problem goes 
- don't write the code in between "" 
- OUTPUT only when everything is ready.


Output JSON format:
{"step":"START|THINK|TOOL|OBSERVE|OUTPUT","content":"string","tool_name":"string (optional)","input":"string (optional)"}
`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: 'Create a folder landing page and a simple landing page using HTML, CSS, and JS' }
  ];

  while (true) {
    const response = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: messages
    });

    const rawContent = response.choices[0].message.content;

    let parsedContent;
    try {
      parsedContent = JSON.parse(rawContent);
    } catch (err) {
      console.error("Failed to parse JSON from model output:", rawContent);
      break;
    }

    messages.push({
      role: "assistant",
      content: JSON.stringify(parsedContent)
    });

    const step = parsedContent.step;

    if (step === "START" || step === "THINK") {
      console.log(parsedContent.content);
      continue;
    }

    if (step === "TOOL") {
      const toolToCall = parsedContent.tool_name;
      if (!toolToCall || !TOOL_MAP[toolToCall]) {
        console.log(`Invalid tool: ${toolToCall}`);
        continue;
      }

      // If the tool is executeCommand, we allow file creation
      if (toolToCall === "executeCommand" && parsedContent.input.startsWith("writeFile:")) {
        const [, filepath, content] = parsedContent.input.split("||");
        fs.writeFileSync(filepath, content);
        messages.push({ role: "developer", content: JSON.stringify({ step: "OBSERVE", content: `${filepath} created` }) });
      } else {
        const output = await TOOL_MAP[toolToCall](parsedContent.input);
        console.log(`${toolToCall} output =`, output);
        messages.push({ role: "developer", content: JSON.stringify({ step: "OBSERVE", content: output }) });
      }
      continue;
    }

    if (step === "OUTPUT") {
      console.log("✅ Final Output:", parsedContent.content);
      break;
    }
  }
}

main();
