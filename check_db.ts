
import { db, sqlite } from "./src/db";
import { mailboxes, checkpoints } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function check() {
    const mailboxList = await db.query.mailboxes.findMany();
    console.log("Mailboxes:", JSON.stringify(mailboxList, null, 2));
    
    const checkpointList = await db.query.checkpoints.findMany();
    console.log("Checkpoints:", JSON.stringify(checkpointList, null, 2));
    
    sqlite.close();
}

check();
