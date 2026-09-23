import VerifyEmailClient from "./VerifyEmailClient";

export default async function VerifyEmailPage({
                                                  searchParams,
                                              }: {
    searchParams: Promise<{ email?: string }>;
}) {
    const { email } = await searchParams;

    return <VerifyEmailClient email={typeof email === "string" ? email : ""} />;
}
