import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if(!supabaseUrl || !supabaseKey) {
  console.log("NO ENV");
  process.exit();
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFetch() {
    console.log("Fetching exercises...");
    const { data: exData, error: exError } = await supabase.from("exercises").select("*");
    console.log("Fetch result:", exData?.length, exError);
}
testFetch();
