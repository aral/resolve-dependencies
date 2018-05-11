import { fork } from 'child_process'
import { basename } from 'path'
import { File } from './file'
import { Semaphore } from '@calebboyd/semaphore'
import { Deferred, createDeferredFactory } from '@calebboyd/semaphore/deferred'
import * as loader from './node-loader'

export type IpcArgs =
  | { modulePath: string; contextName: string; options?: any }
  | { contextName: string; method: string; args: any[] }

type IpcMessage = { result: any; error: string; id: number }
const createDeferred = createDeferredFactory<File>()
export class WorkerThread {
  private lock: Semaphore
  private pending: { [key: number]: Deferred<File> } = {}
  private child = fork(require.resolve('./worker-runtime'))
  constructor({ taskConccurency = 10 } = {}) {
    this.lock = new Semaphore(taskConccurency)
    this.child.on('message', (message: IpcMessage) => {
      this.lock.release()
      const waiter = this.pending[message.id]
      delete this.pending[message.id]
      if (message.error) {
        waiter.reject(new Error(message.error))
      } else {
        waiter.resolve(message.result)
      }
    })
  }

  sendMessage(message: IpcArgs) {
    return this.lock.acquire().then(id => {
      this.child.send({ id, ...message })
      return (this.pending[id] = createDeferred()).promise
    })
  }

  end() {
    this.child.kill()
  }
}
