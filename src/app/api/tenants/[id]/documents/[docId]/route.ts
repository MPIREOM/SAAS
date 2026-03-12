import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { docId } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch doc to get storage path
    const { data: doc } = await supabase
      .from("documents")
      .select("file_url")
      .eq("id", docId)
      .single();

    if (doc?.file_url) {
      await supabase.storage.from("documents").remove([doc.file_url]);
    }

    const { error } = await supabase.from("documents").delete().eq("id", docId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { docId } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: doc } = await supabase
      .from("documents")
      .select("file_url, file_name")
      .eq("id", docId)
      .single();

    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: signed } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.file_url, 60); // 60 second expiry

    if (!signed?.signedUrl) {
      return NextResponse.json({ error: "Could not generate download URL" }, { status: 500 });
    }

    return NextResponse.json({ url: signed.signedUrl, file_name: doc.file_name });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
