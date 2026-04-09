import tls from 'tls'
import net from 'net'

interface NntpOptions {
  host: string
  port: number
  ssl: boolean
  username: string
  password: string
}

export class NntpClient {
  private socket: tls.TLSSocket | net.Socket | null = null
  private buffer = ''
  private pendingResolvers: Array<{ resolve: (lines: string[]) => void; reject: (err: Error) => void }> = []
  private connected = false

  constructor(private opts: NntpOptions) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onConnect = async () => {
        try {
          const greeting = await this.readResponse()
          if (!greeting[0]?.startsWith('2')) throw new Error('NNTP server rejected connection')

          // Authenticate
          const authRes = await this.sendCommand(`AUTHINFO USER ${this.opts.username}`)
          if (authRes[0]?.startsWith('381')) {
            const passRes = await this.sendCommand(`AUTHINFO PASS ${this.opts.password}`)
            if (!passRes[0]?.startsWith('281')) throw new Error('NNTP authentication failed')
          } else if (!authRes[0]?.startsWith('281')) {
            throw new Error('NNTP authentication failed')
          }

          this.connected = true
          resolve()
        } catch (err) {
          reject(err)
        }
      }

      if (this.opts.ssl) {
        this.socket = tls.connect({ host: this.opts.host, port: this.opts.port, rejectUnauthorized: false }, onConnect)
      } else {
        this.socket = net.connect({ host: this.opts.host, port: this.opts.port }, onConnect)
      }

      this.socket.setEncoding('binary')
      this.socket.on('data', (data: string) => this.onData(data))
      this.socket.on('error', (err: Error) => {
        if (!this.connected) reject(err)
        else this.pendingResolvers.forEach(({ reject: r }) => r(err))
      })
    })
  }

  private onData(data: string) {
    this.buffer += data
    this.processBuffer()
  }

  private processBuffer() {
    while (this.pendingResolvers.length > 0) {
      const firstResolver = this.pendingResolvers[0]

      // Check if we have a complete response
      // Multi-line responses end with \r\n.\r\n
      // Single-line responses end with \r\n
      const multiLineEnd = this.buffer.indexOf('\r\n.\r\n')
      const singleLineEnd = this.buffer.indexOf('\r\n')

      if (multiLineEnd !== -1) {
        // Take the first complete multi-line response
        const response = this.buffer.substring(0, multiLineEnd)
        this.buffer = this.buffer.substring(multiLineEnd + 5)
        this.pendingResolvers.shift()
        firstResolver.resolve(response.split('\r\n'))
      } else if (singleLineEnd !== -1) {
        // Single line only if it starts with a 3-digit code + space
        const line = this.buffer.substring(0, singleLineEnd)
        if (/^\d{3}[ -]/.test(line) && !['220', '221', '222', '223'].some(c => line.startsWith(c))) {
          this.buffer = this.buffer.substring(singleLineEnd + 2)
          this.pendingResolvers.shift()
          firstResolver.resolve([line])
        } else {
          break
        }
      } else {
        break
      }
    }
  }

  private readResponse(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.pendingResolvers.push({ resolve, reject })
      this.processBuffer()
    })
  }

  async sendCommand(cmd: string): Promise<string[]> {
    this.socket?.write(cmd + '\r\n', 'binary')
    return this.readResponse()
  }

  async getArticle(messageId: string): Promise<Buffer> {
    const lines = await this.sendCommand(`BODY <${messageId}>`)
    if (!lines[0]?.startsWith('222')) {
      throw new Error(`Article not found: ${lines[0]}`)
    }
    // lines[0] is the status line, rest is body
    const body = lines.slice(1).join('\r\n')
    return Buffer.from(body, 'binary')
  }

  close() {
    this.socket?.destroy()
    this.connected = false
  }
}
