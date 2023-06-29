import { NextResponse } from "next/server";
import dayjs from "dayjs";

type User = {
  id: string;
  handle: string;
  img_url: string;
  email: string;
};

type Version = {
  id: string;
  created_at: string;
  label: string;
  description: string;
  user: User;
};

type Comment = {
  id: string;
  created_at: string;
  user: User;
  message: string;
  client_meta?: {
    node_id: string;
    node_offset: {
      x: number;
      y: number;
    };
  };
};

const FIGMA_TOKEN = process.env.FIGMA_TOKEN!;
const FIGMA_FILE_ID = process.env.FIGMA_FILE_ID!;
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK!;
const FIGMA_FILE_LINK = process.env.FIGMA_FILE_LINK ?? "https://www.figma.com/file/your_file_id/your_file_name";
const FIGMA_COMMENT_LINK = process.env.FIGMA_COMMENT_LINK ?? "https://www.figma.com/file/your_file_id/your_file_name";

let intervalId: NodeJS.Timer;
let lastVersion: Version;
let lastComment: Comment;

// Thursday, June 29 1:46 AM
const TIME_FORMAT = "dddd, MMMM D h:mm A";

const INTERVAL_TIME = 1 * 20 * 1000;

function fetchVersions() {
  fetch(`https://api.figma.com/v1/files/${FIGMA_FILE_ID}/versions`, {
    method: "GET",
    headers: {
      "X-Figma-Token": FIGMA_TOKEN,
    },
  })
    .then((res) => res.json())
    .then((data: { versions: Version[] }) => {
      if (lastVersion) {
        const versions = data.versions;
        const prevVersionIdx = versions.findIndex((item) => item.id === lastVersion.id);
        const newVersions = versions.slice(0, prevVersionIdx);
        if (newVersions.length) {
          msgToSlack("version", newVersions);
          lastVersion = newVersions[0];
        }
      } else {
        lastVersion = data.versions[0];
      }
    })
    .catch((err) => console.log(err));
}

function fetchComments() {
  fetch(`https://api.figma.com/v1/files/${FIGMA_FILE_ID}/comments`, {
    method: "GET",
    headers: {
      "X-Figma-Token": FIGMA_TOKEN,
    },
  })
    .then((res) => res.json())
    .then((data: { comments: Comment[] }) => {
      if (lastComment) {
        const comments = data.comments;
        if (comments[0].id > lastComment.id) {
          const prevCommentIdx = comments.findIndex((item) => item.id === lastComment.id);
          const newComments = comments.slice(0, prevCommentIdx);
          if (newComments.length) {
            msgToSlack("comment", newComments);
            lastComment = newComments[0];
          }
        }
      } else {
        lastComment = data.comments[0];
      }
    })
    .catch((err) => console.log(err));
}

function msgToSlack(type: "version", msg: Version[]): void;
function msgToSlack(type: "comment", msg: Comment[]): void;
function msgToSlack(type: "version" | "comment", msg: Version[] | Comment[]) {
  try {
    let msgTemplate;
    if (type === "version") {
      const repeatedBlocks: any = [];

      (msg as Version[]).map((item) => {
        const createAt = dayjs(item.created_at).format(TIME_FORMAT);
        repeatedBlocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*By <donotclick.me|${item.user.handle}>*\n${createAt}\n${item.label}\n${item.description}`,
          },
          accessory: {
            type: "image",
            image_url: item.user.img_url,
            alt_text: "Figma avatar",
          },
        });
        repeatedBlocks.push({
          type: "divider",
        });

        return item;
      });
      msgTemplate = {
        blocks: [
          {
            type: "section",
            text: {
              type: "plain_text",
              emoji: true,
              text: "👉 Looks like Figma UI has new changes:",
            },
          },
          {
            type: "divider",
          },
          ...repeatedBlocks,
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `<${FIGMA_FILE_LINK}|Go to Figma>`,
            },
          },
        ],
      };
    } else if (type === "comment") {
      const repeatedBlocks: any = [];
      (msg as Comment[]).map((item) => {
        const createAt = dayjs(item.created_at).format(TIME_FORMAT);
        repeatedBlocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${createAt}*\n${item.message}\n_From <donotclick.me|${item.user.handle}>_`,
          },
        });
        return item;
      });
      msgTemplate = {
        blocks: [
          {
            type: "section",
            text: {
              type: "plain_text",
              emoji: true,
              text: "👉 Looks like Figma UI has new comments:",
            },
          },
          {
            type: "divider",
          },
          ...repeatedBlocks,
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `<${FIGMA_COMMENT_LINK.replace("{ID}", msg[0].id)}|Show more comments>`,
            },
          },
        ],
      };
    }
    fetch(SLACK_WEBHOOK, {
      method: "POST",
      body: JSON.stringify(msgTemplate),
    });
  } catch (err) {
    throw err;
  }
}

export async function POST(request: Request) {
  if (intervalId) {
    clearInterval(intervalId);
  }
  intervalId = setInterval(() => {
    fetchVersions();
    fetchComments();
  }, INTERVAL_TIME);
  return NextResponse.json({
    message: "create success.",
  });
}

export async function DELETE(request: Request) {
  if (intervalId) {
    clearInterval(intervalId);
    return NextResponse.json({
      message: "clear successful.",
    });
  }
  return NextResponse.json({
    message: "not timer running .",
  });
}
