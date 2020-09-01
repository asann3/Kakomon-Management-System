import merge from 'deepmerge'
import moment from 'moment'
import netlifyIdentity from 'netlify-identity-widget'

const url = process.env.VUE_APP_URL

type Actions = {
  [key in string]: (vuex: { commit: any, state: any, dispatch: any }, payload: any) => any
}

const actions: Actions =  {
  getBranches: async ({ commit, state }) => {
    commit('setBranchesStatus', { path: 'branches', status: 'loading' })
    const token = state.currentUser.token.access_token
    const getMethod = 'GET'
    const headers = {
      Authorization: `Bearer ${token}`
    }
    const httpRes = await fetch(`${url}/github/branches`, {
      method: getMethod,
      headers
    })
    const res = await httpRes.json()

    const branches = (Object as any).fromEntries(
      res.map((branch: any) => [branch.name, branch.commit.sha])
    )
    commit('setBranches', { branches })
  },

  selectBranch: async ({ dispatch, commit, state }, branchName) => {
    commit('setCurrentBranch', branchName)
    await dispatch('getBranches')
    const commitSha = state.branches.data[branchName]
    await dispatch('getCommit', commitSha)
  },

  getCommit: async ({ dispatch, commit, state }, commitSha) => {
    const commitDataInState = state.commits?.[commitSha]
    if (commitDataInState?.status === 'loaded') {
      (Object as any).entries(commitDataInState.data).map(async ([name, sha]: string) => {
        await dispatch('getContentMetadata', { filename: name, fileSha: sha })
      })

      return
    }

    commit('setCommitStatus', { sha: commitSha, status: 'loading' })

    const commitDataInLocalStorage = JSON.parse(localStorage.getItem(commitSha) as string)
    if (commitDataInLocalStorage != null) {
      commit('setCommit', {
        sha: commitSha,
        data: commitDataInLocalStorage
      })
      await Promise.all([
        (Object as any).entries(commitDataInLocalStorage).map(async ([name, sha]: [string, string]) => {
          await dispatch('getContentMetadata', { filename: name, fileSha: sha })
        })
      ])

      return
    }

    const token = state.currentUser.token.access_token
    const getMethod = 'GET'
    const headers = {
      Authorization: `Bearer ${token}`
    }

    const httpRes = await fetch(
      `${url}/github/contents/metadatas?ref=${commitSha}`,
      { method: getMethod, headers }
    )
    const res = await httpRes.json()

    const commitData: any = (Object as any).fromEntries(
      res.map((file: any) => [file.name, file.sha])
    )

    ;(Object as any).entries(commitData).map(async ([name, sha]: [string, string]) => {
      await dispatch('getContentMetadata', { filename: name, fileSha: sha })
    })

    commit('setCommit', {
      sha: commitSha,
      data: commitData
    })

    localStorage.setItem(`${commitSha}`, JSON.stringify(commitData))
  },

  getContentMetadata: async ({ commit, state }, payload) => {
    const fileDataInState = state.contentMetadatas?.[payload.fileSha]
    if (fileDataInState?.status === 'loaded') {
      return
    }

    commit('setContentMetadataStatus', {
      sha: payload.fileSha,
      status: 'loading'
    })

    const fileDataInLocalStorage = JSON.parse(
      localStorage.getItem(payload.fileSha) as string
    )
    if (fileDataInLocalStorage != null) {
      commit('setContentMetadata', {
        sha: payload.fileSha,
        data: fileDataInLocalStorage
      })
      return
    }

    const token = state.currentUser.token.access_token
    const getMethod = 'GET'
    const headers = {
      Authorization: `Bearer ${token}`
    }

    const httpRes = await fetch(`${url}/github/git/blobs/${payload.fileSha}`, {
      method: getMethod,
      headers
    })
    const res = await httpRes.json()

    const csvData = Buffer.from(res.content, 'base64').toString('utf8')
    const resultObj = convertCsvToObj(csvData, payload.filename)

    commit('setContentMetadata', {
      sha: payload.fileSha,
      data: resultObj
    })

    localStorage.setItem(payload.fileSha, JSON.stringify(resultObj))
  },

  postCommitCsv: async ({ state }) => {
    const token = state.currentUser.token.access_token
    const getMethod = 'GET'
    const postMethod = 'POST'
    const patchMethod = 'PATCH'
    const headers = {
      Authorization: `Bearer ${token}`
    }
    const userEmail = state.currentUser.email
    const userNameLength = userEmail.search('@')
    const userName = userEmail.slice(0, userNameLength)
    const branchName = state.currentBranch

    const objName = 'tests/2018/テスト_2018_後期中間_論理回路i_問題001.jpg'
    const csvSha = '02f495e08b05c5b5b71c90a9c7c0f906a818aa80'

    const newContentMetadata = merge({}, state.contentMetadatas[csvSha].data)
    const exchangeFileObj = state.changedFiles[objName]
    merge(newContentMetadata[objName], exchangeFileObj)

    const editedCsvObj = newContentMetadata

    // editedobject→csv
    const objArray = Object.values(editedCsvObj)
    const content = convertObjToCsv(objArray)
    // refの取得
    const refRes = await fetch(`${url}/github/git/refs/heads/${branchName}`, {
      method: getMethod,
      headers
    })
    const parseRef = await refRes.json()

    // commitの取得
    const commitRes = await fetch(
      `${url}/github/commits/${parseRef.object.sha}`,
      { method: getMethod, headers }
    )
    const commitres = await commitRes.json()

    const postContents = {
      content,
      encoding: 'utf-8'
    }
    const postContentsBody = JSON.stringify(postContents)

    // blobの作成
    const createBlobRes = await fetch(
      `${url}/github/git/blobs?ref=${branchName}`,
      { method: postMethod, headers, body: postContentsBody }
    )
    const blobRes = await createBlobRes.json()
    console.log('check', blobRes)
    const fileInfo = {
      base_tree: commitres.commit.tree.sha,
      tree: [
        {
          path: 'test.csv',
          mode: '100644',
          type: 'blob',
          sha: blobRes.sha
        }
      ]
    }

    // treeの作成
    const postFileInfoBody = JSON.stringify(fileInfo)
    const createTreeRes = await fetch(`${url}/github/git/trees`, {
      method: postMethod,
      headers,
      body: postFileInfoBody
    })
    const treeRes = await createTreeRes.json()
    const date = moment().format('YYYY-MM-DDTHH:mm:ssZ')

    const postCommitInfo = {
      message: date,
      author: {
        name: userName,
        email: userEmail,
        date
      },
      parents: [parseRef.object.sha],
      tree: treeRes.sha
    }
    const postCommitInfoBody = JSON.stringify(postCommitInfo)

    // commitの作成
    const createCommitRes = await fetch(
      `${url}/github/git/commits?ref=${branchName}`,
      { method: postMethod, headers, body: postCommitInfoBody }
    )
    const createdCommitRes = await createCommitRes.json()

    // refの更新
    const updateRef = {
      sha: createdCommitRes.sha,
      force: false // 強制pushするか否
    }
    const updateRefs = JSON.stringify(updateRef)
    await fetch(`${url}/github/git/refs/heads/${branchName}`, {
      method: patchMethod,
      headers,
      body: updateRefs
    })
  },

  updateCurrentUser: async ({ commit }) => {
    const user = netlifyIdentity.currentUser()
    if (user != null && user.token.access_token == null) {
      await netlifyIdentity.refresh()
    }
    commit('updateCurrentUser', user)
  },

  getImageShas: async ({ state, commit }, { commitSha, directoryPath }) => {
    if (state.imageShas?.[commitSha]?.[directoryPath]?.status === 'loaded') {
      return
    }

    const token = state.currentUser.token.access_token
    const method = 'GET'
    const headers = {
      Authorization: `Bearer ${token}`
    }

    const httpRes = await fetch(
      `${url}/github/contents/${directoryPath}?ref=${commitSha}`,
      { method, headers }
    )
    const res = await httpRes.json()

    const data = Object.fromEntries(res.map(file => [file.name, file.sha]))
    commit('setImageShas', { commitSha, directoryPath, data })
  },

  getImageDatas: async ({ dispatch, state, commit }, fileSha) => {
    const commitSha = state.branches.data[state.currentBranch]
    const files = state.contentMetadatas[fileSha].data
    const directoryPath = Object.keys(files)[0].substr(
      0,
      Object.keys(files)[0].lastIndexOf('/')
    )

    const filePaths = Object.keys(files)
    commit('setDisplayedFiles', filePaths)
    await dispatch('getImageShas', { commitSha, directoryPath })

    const filenames = Object.values(files).map(file => {
      const path = file.src
      return path.substr(path.lastIndexOf('/') + 1)
    })

    await Promise.all(
      filenames.map(async filename => {
        const sha = state.imageShas[commitSha][directoryPath].data[filename]
        const token = state.currentUser.token.access_token
        const method = 'GET'
        const headers = {
          Authorization: `Bearer ${token}`
        }
        const httpRes = await fetch(`${url}/github/git/blobs/${sha}`, {
          method,
          headers
        })
        const res = await httpRes.json()

        // Todo: image/ だけじゃなくpdfとかもあるので対応できるようにする
        const imageType = filename.substr(filename.lastIndexOf('.') + 1)
        const blob = toBlob(res.content, imageType)
        const blobUri = URL.createObjectURL(blob)

        commit('setImageData', { sha, blobUri })
      })
    )
  },

  createBranch: async ({ state, commit }, branch) => {
    commit('setBranchesStatus', { path: 'branches', status: 'loading' })
    const token = state.currentUser.token.access_token
    const method = 'GET'
    const headers = {
      Authorization: `Bearer ${token}`
    }
    const httpRes = await fetch(`${url}/github/git/refs/heads/master`, {
      method,
      headers
    })
    const res = await httpRes.json()
    const masterSha = res.object.sha

    // branchの作成
    const body = JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: `${masterSha}`
    })

    await fetch(`${url}/github/git/refs`, {
      method: 'POST',
      headers,
      body
    })

    console.log(`created new branch: ${branch}`)
  },

  upload: async ({ state, dispatch }, payload) => {
    const commitSha = state.branches.data[payload.branch]
    const createCommitPayload = {
      commitSha: commitSha,
      branch: payload.branch,
      files: payload.files,
      commitMessage: payload.commitMessage
    }
    await dispatch('createCommit', createCommitPayload)
  },

  createCommit: async ({ state }, payload) => {
    // https://int128.hatenablog.com/entry/2017/09/05/161641 詳しくはここ見ろ
    const token = state.currentUser.token.access_token
    const headers = {
      Authorization: `Bearer ${token}`
    }

    const commitHttpRes = await fetch(
      `${url}/github/git/commits/${payload.commitSha}`,
      {
        method: 'GET',
        headers
      }
    )
    const commitRes = await commitHttpRes.json()

    const csvBlobSha = await getCsvBlobSha(state, {
      files: payload.files,
      branch: payload.branch
    })

    const treeMetadatas = await Promise.all(
      (Object as any).entries(payload.files).map(async ([filename, blobUri]: [string, string]) => {
        const httpBlob = await fetch(`${blobUri}`)
        const blob = await httpBlob.blob()
        const base64 = await readFileAsync(blob)

        const blobShaHttpRes = await fetch(
          `${url}/github/git/blobs?ref=${payload.branch}`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              content: base64,
              encoding: 'base64'
            })
          }
        )
        const blobShaRes = await blobShaHttpRes.json()

        return { filename, sha: blobShaRes.sha }
      })
    )

    const imagesTree = treeMetadatas.map(data => {
      return {
        path: `scanned/${data.filename}`,
        mode: '100644',
        type: 'blob',
        sha: data.sha
      }
    })
    const day = moment().format('YYYY-MM-DD_HHmmss')
    const csvTree = [
      {
        path: `metadatas/unassorted_${day}_${payload.commitMessage}.csv`,
        mode: '100644',
        type: 'blob',
        sha: csvBlobSha
      }
    ]
    const tree = [...imagesTree, ...csvTree]
    const treeData = {
      base_tree: commitRes.tree.sha,
      tree: tree
    }
    const createTreeHttpRes = await fetch(`${url}/github/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify(treeData)
    })
    const createTreeRes = await createTreeHttpRes.json()

    const email = state.currentUser.email
    const name = email.substr(0, email.lastIndexOf('@'))
    const createCommitBody = {
      message: payload.commitMessage,
      author: {
        name,
        email,
        date: moment().format('YYYY-MM-DDTHH:mm:ssZ')
      },
      parents: [payload.commitSha],
      tree: createTreeRes.sha
    }
    const createCommitHttpRes = await fetch(
      `${url}/github/git/commits?ref=${payload.branch}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(createCommitBody)
      }
    )
    const createCommitRes = await createCommitHttpRes.json()

    await fetch(`${url}/github/git/refs/heads/${payload.branch}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        sha: createCommitRes.sha,
        force: false
      })
    })
  }
}

export function convertObjToCsv(arr) {
  const contents = []

  for (const property in arr) {
    contents.push(
      arr[property].src +
        ',' +
        arr[property].subj +
        ',' +
        arr[property].tool_type +
        ',' +
        arr[property].period +
        ',' +
        arr[property].year +
        ',' +
        arr[property].content_type +
        ',' +
        arr[property].author +
        ',' +
        arr[property].image_index +
        ',' +
        arr[property].included_pages_num +
        ',' +
        arr[property].fix_text
    )
  }
  const csvHeaders = `src,subj,tool_type,period,year,content_type,author,image_index,included_pages_num,fix_text\n`
  const unionCsv = contents.join(`\n`)
  const convertedCsvFile = csvHeaders + unionCsv
  return convertedCsvFile
}

export function convertCsvToObj(csv, filename) {
  // headerNames:CSV1行目の項目 :csvRows:項目に対する値
  const [headerNames, ...csvRows] = csv
    .split('\n')
    .filter(row => row !== '')
    .map(row => {
      return row.split(',')
    })

  return csvRows
    .map(r => {
      return headerNames
        .map((headerName, index) => {
          return { key: headerName.replace(/\s+/g, ''), value: r[index] }
        })
        .reduce((previous, current) => {
          previous[current.key] = current.value
          return previous
        }, {})
    })
    .reduce((previous, current) => {
      previous[current.src] = {
        ...current,
        csvFile: filename
      }
      return previous
    }, {})
}

function toBlob(base64, type) {
  const bin = atob(base64.replace(/^.*,/, ''))
  const buffer = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    buffer[i] = bin.charCodeAt(i)
  }
  // Blobを作成

  return new Blob([buffer.buffer], { type })
}

export function readFileAsync(blob: any) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.replace(/data:.*\/.*;base64,/, '')
      resolve(base64)
    }
    reader.readAsDataURL(blob)
  })
}

export async function getCsvBlobSha(state: any, payload: any) {
  const headerRow = `src,subj,tool_type,period,year,content_type,author,image_index,included_pages_num,fix_text\n`
  const sortedFiles = Object.keys(payload.files).sort()
  const filesRows = sortedFiles.reduce((p, src) => {
    p += `scanned/${src},,,,,,,,,\n`
    return p
  }, '')
  const csv = headerRow + filesRows

  const token = state.currentUser.token.access_token
  const headers = {
    Authorization: `Bearer ${token}`
  }

  const blobShaHttpRes = await fetch(
    `${url}/github/git/blobs?ref=${payload.branch}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: csv,
        encoding: 'utf-8'
      })
    }
  )
  const blobShaRes = await blobShaHttpRes.json()

  return blobShaRes.sha
}

export default actions