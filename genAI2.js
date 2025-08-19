import 'dotenv/config'
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import { exec } from "child_process";

// Init Gemini client
const genAI = new GoogleGenerativeAI("AIzaSyCTnqPkMXNY6fT-b8VOyD4aYyBytW3DinE");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-" });

async function getWeatherCity(cityname = " ") {
  const url = `https://wttr.in/${cityname.toLowerCase()}?format=%C+%t`;
  const { data } = await axios.get(url, { responseType: "text" });
  return `The current weather of ${cityname} is ${data}`;
}

async function executeCommand(cmd = "") {
  return new Promise((res, rej) => {
    exec(cmd, (error, data) => {
      if (error) return res(`error running command ${error}`);
      res(data);
    });
  });
}

const TOOL_MAP = {
  getWeatherCity,
  executeCommand,
};

async function main() {
 const SYSTEM_PROMPT = `
You are an AI assistant that must always respond in JSON with exactly one of the steps:
START, THINK, TOOL, OBSERVE, or OUTPUT.  
The goal is to help the user by using available tools (getWeatherCity, executeCommand).  

## RULES
- Always break down the problem into sub-steps before OUTPUT.
- Always use TOOL calls for filesystem tasks like mkdir, echo, or file content writing.
- Always check your own reasoning using THINK steps before final OUTPUT.
- Always wait for OBSERVE before continuing after TOOL.

## OUTPUT JSON FORMAT:
{"step":"START|THINK|TOOL|OBSERVE|OUTPUT","content":"string","tool_name":"string (optional)","input":"string (optional)"}

## TOOLS:
- getWeatherCity(city:string) → returns weather string.
- executeCommand(command:string) → runs Linux/Unix shell commands like mkdir, touch, echo, cat, ls.

## INSTRUCTIONS for creating todo_app:
1. Use \`executeCommand\` with \`mkdir todo_app\` to create project folder.
2. Use \`executeCommand\` with \`echo\` to create:
   - index.html
   - style.css
   - script.js
3. index.html must contain a responsive Todo App UI with linked CSS and JS.
4. style.css must provide modern UI (centered container, shadows, hover effects).
5. script.js must support adding and deleting todos (appendChild + remove functionality).
6. Verify correctness before OUTPUT.

## EXAMPLE
User: "make a todo app"
ASSISTANT: {"step":"START","content":"The user wants a todo app with HTML, CSS, and JS."}
ASSISTANT: {"step":"THINK","content":"I need to create a folder and 3 files first."}
ASSISTANT: {"step":"TOOL","tool_name":"executeCommand","input":"mkdir todo_app"}
...
ASSISTANT: {"step":"TOOL","tool_name":"executeCommand","input":"echo '<!DOCTYPE html>...' > todo_app/index.html"}
...
DEVELOPER: {"step":"OBSERVE","content":"index.html created successfully"}
ASSISTANT: {"step":"THINK","content":"Now I need to add CSS for styling."}
...
ASSISTANT: {"step":"OUTPUT","content":"Todo app created with HTML, CSS, JS in ./todo_app. Open index.html in browser."}
`


const history = [
  {
    role: "user",
    parts: [{ text: SYSTEM_PROMPT }],
  },
  {
    role: "user",
    parts: [{ text: "hey create a folder todo_app and create simple todo app..." }],
  },
];

  while (true) {
    const result = await model.generateContent({
      contents: history,
    });

    const rawContent = result.response.candidates[0].content.parts[0].text;
    console.log("RAW:", rawContent);

    let parsedContent;
    try {
      parsedContent = JSON.parse(rawContent);
    } catch (err) {
      console.error("Failed to parse JSON:", rawContent);
      break;
    }

    history.push({ role: "model", parts: JSON.stringify(parsedContent) });

    if (parsedContent.step === "START" || parsedContent.step === "THINK") {
      console.log(parsedContent.content);
      continue;
    }

    if (parsedContent.step === "TOOL") {
      const toolToCall = parsedContent.tool_name;
      if (!TOOL_MAP[toolToCall]) {
        history.push({ role: "user", parts: `No such tool ${toolToCall}` });
        continue;
      }
      const responseFromTool = await TOOL_MAP[toolToCall](parsedContent.input);
      console.log(`${toolToCall}(...) = `, responseFromTool);

      history.push({
        role: "user",
        parts: JSON.stringify({ step: "OBSERVE", content: responseFromTool }),
      });
      continue;
    }

    if (parsedContent.step === "OUTPUT") {
      console.log(parsedContent.content);
      break;
    }
  }
}

main();
