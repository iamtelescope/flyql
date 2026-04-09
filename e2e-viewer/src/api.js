export async function fetchReport() {
    const res = await fetch(import.meta.env.DEV ? '/api/report' : './report.json')
    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
    }
    return res.json()
}
