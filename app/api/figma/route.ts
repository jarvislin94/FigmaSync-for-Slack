import { NextResponse } from "next/server";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

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
  uuid: string;
  file_key: string;
  parent_id: string;
  resolved_at: string;
  reactions: any[];
  order_id: string;
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

// Thursday, June 29 1:46 AM
const TIME_FORMAT = "dddd, MMMM D h:mm A";

let count = 0;
let lastVersion: Version;
let lastComment: Comment;

async function fetchVersions() {
  return (
    await (
      await fetch(`https://api.figma.com/v1/files/${FIGMA_FILE_ID}/versions`, {
        method: "GET",
        headers: {
          "X-Figma-Token": FIGMA_TOKEN,
        },
      })
    ).json()
  ).versions as Version[];
}

async function fetchComments() {
  return (
    await (
      await fetch(`https://api.figma.com/v1/files/${FIGMA_FILE_ID}/comments`, {
        method: "GET",
        headers: {
          "X-Figma-Token": FIGMA_TOKEN,
        },
      })
    ).json()
  ).comments as Comment[];
}

function msgToSlack(type: "version", msg: Version[]): void;
function msgToSlack(type: "comment", msg: Comment[]): void;
function msgToSlack(type: "version" | "comment", msg: Version[] | Comment[]) {
  let msgTemplate;
  if (type === "version") {
    const repeatedBlocks: any = [];
    (msg as Version[]).map((item) => {
      const createAt = dayjs.utc(item.created_at).utcOffset(8).format(TIME_FORMAT);
      repeatedBlocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*By <donotclick.me|${item.user.handle}>* | ${createAt}\n${item.label ?? "No title"}\n${
            item.description ?? "No description"
          }`,
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
      const createAt = dayjs.utc(item.created_at).utcOffset(8).format(TIME_FORMAT);
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

  return fetch(SLACK_WEBHOOK, {
    method: "POST",
    body: JSON.stringify(msgTemplate),
  });
}

export async function POST() {
  try {
    const [versions, comments] = await Promise.all([fetchVersions(), fetchComments()]);
    if (!lastVersion && !lastComment) {
      lastVersion = versions[0];
      lastComment = comments[0];
      return NextResponse.json({
        status: 200,
        message: "initial data",
      });
    } else {
      const prevVersionIdx = versions.findIndex((item) => item.id === lastVersion.id);
      const newVersions = versions.slice(0, prevVersionIdx);
      console.log("newVersions:", newVersions.length);
      if (newVersions.length) {
        await msgToSlack("version", newVersions);
        lastVersion = newVersions[0];
      }
      const prevCommentIdx = comments.findIndex((item) => item.id === lastComment.id);
      // comment be deleted
      if (prevCommentIdx === -1) {
        lastComment = comments[0];
      } else {
        const newComments = comments.slice(0, prevCommentIdx);
        console.log("newComments:", newComments.length);
        if (newComments.length) {
          await msgToSlack("comment", newComments);
          lastComment = newComments[0];
        }
      }
    }
    count++;
    return NextResponse.json({
      status: 0,
      message: "success",
      data: {
        count,
      },
    });
  } catch (err) {
    return NextResponse.json({
      status: 1,
      message: "fail",
      err,
    });
  }
}
