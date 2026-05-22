export async function resolveMock<T>(data: T): Promise<T> {
  return Promise.resolve(data)
}
