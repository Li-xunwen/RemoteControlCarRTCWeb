//AgoraRTC.enableLogUpload();

let options = getOptionsFromLocal()

var client;
var localTracks = {
  videoTrack: null,
  audioTrack: null
};
var currentMic = null
var currentCam = null
var mics = []
var cams = []
var remoteUsers = {};
//var options = getOptionsFromLocal()
var curVideoProfile;

AgoraRTC.onAutoplayFailed = () => {
  alert("click to start autoplay!");
};

AgoraRTC.onMicrophoneChanged = async changedDevice => {
  // When plugging in a device, switch to a device that is newly plugged in.
  if (changedDevice.state === "ACTIVE") {
    localTracks.audioTrack.setDevice(changedDevice.device.deviceId);
    // Switch to an existing device when the current device is unplugged.
  } else if (changedDevice.device.label === localTracks.audioTrack.getTrackLabel()) {
    const oldMicrophones = await AgoraRTC.getMicrophones();
    oldMicrophones[0] && localTracks.audioTrack.setDevice(oldMicrophones[0].deviceId);
  }
};

AgoraRTC.onCameraChanged = async changedDevice => {
  // When plugging in a device, switch to a device that is newly plugged in.
  if (changedDevice.state === "ACTIVE") {
    localTracks.videoTrack.setDevice(changedDevice.device.deviceId);
    // Switch to an existing device when the current device is unplugged.
  } else if (changedDevice.device.label === localTracks.videoTrack.getTrackLabel()) {
    const oldCameras = await AgoraRTC.getCameras();
    oldCameras[0] && localTracks.videoTrack.setDevice(oldCameras[0].deviceId);
  }
};


$("#step-join").attr("disabled", true);
$("#step-publish").attr("disabled", true);
$("#step-subscribe").attr("disabled", true);
$("#step-leave").attr("disabled", true);

$(".mic-list").change(function (e) {
  switchMicrophone(this.value);
})

$(".cam-list").change(function (e) {
  switchCamera(this.value);
})


$("#step-create").click(function (e) {
  createClient()
  addSuccessIcon("#step-create")
  message.success("Create client success!");
  $("#step-create").attr("disabled", true);
  $("#step-join").attr("disabled", false);
})


$("#step-join").click(async function (e) {
  try {
    options.channel = $("#channel").val();
    options.uid = Number($("#uid").val());
    options.token = await agoraGetAppData(options);
    await join()
    setOptionsToLocal(options)
    addSuccessIcon("#step-join")
    message.success("Join channel success!");
    $("#step-join").attr("disabled", true);
    $("#step-publish").attr("disabled", false);
    $("#step-subscribe").attr("disabled", false);
    $("#step-leave").attr("disabled", false);
    $("#mirror-check").attr("disabled", false);
  } catch (error) {
    message.error(error.message)
    console.error(error);
  }
})

$("#step-publish").click(async function (e) {
  await createTrackAndPublish()
  addSuccessIcon("#step-publish")
  message.success("Create tracks and publish success!");
  initDevices()
  $("#step-publish").attr("disabled", true);
  $("#mirror-check").attr("disabled", true)
  // agora content inspect start  
  agoraContentInspect(localTracks.videoTrack)
  // agora content inspect end ;
})

$("#step-subscribe").click(function (e) {
  const uid = $("#remote-uid").val()
  const user = remoteUsers[uid]
  if (!user) {
    return message.error(`User:${uid} not found!`)
  }
  const audioCheck = $("#audio-check").prop("checked")
  const videoCheck = $("#video-check").prop("checked")
  if (audioCheck) {
    subscribe(user, "audio");
  }
  if (videoCheck) {
    subscribe(user, "video");
  }
  addSuccessIcon("#step-subscribe")
  message.success("Subscribe and Play success!");
})

$("#step-leave").click(async function (e) {
  await leave()
  message.success("Leave channel success!");
  removeAllIcons()
  $("#local-player-name").text("");
  $("#join").attr("disabled", false);
  $("#leave").attr("disabled", true);
  $("#step-leave").attr("disabled", true);
  $("#step-join").attr("disabled", true);
  $("#step-publish").attr("disabled", true);
  $("#step-subscribe").attr("disabled", true);
  $("#mirror-check").attr("disabled", true);
  $("#step-create").attr("disabled", false);
  $("#remote-uid").val("")
  $("#remote-playerlist").html("");
})


function createClient() {
  // create Agora client
  client = AgoraRTC.createClient({
    mode: "rtc",
    codec: "vp8"
  });
}

async function createTrackAndPublish() {
  // create local audio and video tracks
  const tracks = await Promise.all([
    AgoraRTC.createMicrophoneAudioTrack({
      encoderConfig: "music_standard"
    }),
    AgoraRTC.createCameraVideoTrack()
  ])
  localTracks.audioTrack = tracks[0]
  localTracks.videoTrack = tracks[1]
  // play local video track
  localTracks.videoTrack.play("local-player", {
    mirror: $("#mirror-check").prop("checked")
  });
  $("#local-player-name").text(`uid: ${options.uid}`);
  // publish local tracks to channel
  await client.publish(Object.values(localTracks));
}

/*
 * Join a channel, then create local video and audio tracks and publish them to the channel.
 */
async function join() {
  client.on("user-published", handleUserPublished);
  client.on("user-unpublished", handleUserUnpublished);

  // start Proxy if needed
  const mode = Number(options.proxyMode)
  if (mode != 0 && !isNaN(mode)) {
    client.startProxyServer(mode);
  }

  options.uid = await client.join(options.appid, options.channel, options.token || null, options.uid || null)
}

/*
 * Stop all local and remote tracks then leave the channel.
 */
async function leave() {
  for (trackName in localTracks) {
    var track = localTracks[trackName];
    if (track) {
      track.stop();
      track.close();
      localTracks[trackName] = undefined;
    }
  }
  // Remove remote users and player views.
  remoteUsers = {};
  // leave the channel
  await client.leave();
}

/*
 * Add the local use to a remote channel.
 *
 * @param  {IAgoraRTCRemoteUser} user - The {@link  https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/iagorartcremoteuser.html| remote user} to add.
 * @param {trackMediaType - The {@link https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/itrack.html#trackmediatype | media type} to add.
 */
async function subscribe(user, mediaType) {
  const uid = user.uid;
  // subscribe to a remote user
  await client.subscribe(user, mediaType);
  console.log("subscribe success");
  if (mediaType === "video") {
    if ($(`#player-${uid}`).length) {
      return
    }
    const player = $(`
     <div id="player-wrapper-${uid}">
            <div id="player-${uid}" class="player">
                 <div class="player-name">uid: ${uid}</div>
            </div>
     </div>
    `);
    $("#remote-playerlist").append(player);
    user.videoTrack.play(`player-${uid}`);
  }
  if (mediaType === "audio") {
    user.audioTrack.play();
  }
}

/*
 * Add a user who has subscribed to the live channel to the local interface.
 *
 * @param  {IAgoraRTCRemoteUser} user - The {@link  https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/iagorartcremoteuser.html| remote user} to add.
 * @param {trackMediaType - The {@link https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/itrack.html#trackmediatype | media type} to add.
 */
function handleUserPublished(user, mediaType) {
  const id = user.uid;
  remoteUsers[id] = user;
  $("#remote-uid").val(id)
}

/*
 * Remove the user specified from the channel in the local interface.
 *
 * @param  {string} user - The {@link  https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/iagorartcremoteuser.html| remote user} to remove.
 */
function handleUserUnpublished(user, mediaType) {
  if (mediaType === "video") {
    const id = user.uid;
    delete remoteUsers[id];
    $(`#player-wrapper-${id}`).remove();
  }
}


async function initDevices() {
  // get mics
  mics = await AgoraRTC.getMicrophones();
  $(".mic-list").empty();
  mics.forEach(mic => {
    const value = mic.label.split(" ").join("")
    $(".mic-list").append(`<option value=${value}>${mic.label}</option>`);
  });

  const audioTrackLabel = localTracks.audioTrack.getTrackLabel();
  currentMic = mics.find(item => item.label === audioTrackLabel);
  $(".mic-list").val(audioTrackLabel.split(" ").join(""));

  // get cameras
  cams = await AgoraRTC.getCameras();
  $(".cam-list").empty();
  cams.forEach(cam => {
    const value = cam.label.split(" ").join("")
    $(".cam-list").append(`<option value=${value}>${cam.label}</option>`);
  });

  const videoTrackLabel = localTracks.videoTrack.getTrackLabel();
  currentCam = cams.find(item => item.label === videoTrackLabel);
  $(".cam-list").val(videoTrackLabel.split(" ").join(""));
}

async function switchCamera(label) {
  currentCam = cams.find(cam => cam.label.split(" ").join("") === label);
  // switch device of local video track.
  await localTracks.videoTrack.setDevice(currentCam.deviceId);
}

async function switchMicrophone(label) {
  currentMic = mics.find(mic => mic.label.split(" ").join("") === label);
  // switch device of local audio track.
  await localTracks.audioTrack.setDevice(currentMic.deviceId);
}



//////////////////////SetAPPID///////////////////////////////

var modeList = [{
  label: "Off",
  detail: "Disable Cloud Proxy",
  value: "0"
}, {
  label: "UDP Mode",
  detail: "Enable Cloud Proxy via UDP protocol",
  value: "3"
}, {
  label: "TCP Mode",
  detail: "Enable Cloud Proxy via TCP/TLS port 443",
  value: "5"
}];

var proxyModeItem;

$(() => {
  initVersion();
  initModes();
});

$(".proxy-list").change(function (e) {
  changeModes(this.value);
})


$("#setup-btn").click(function (e) {
  options.appid = escapeHTML($("#appid").val())
  options.certificate = escapeHTML($("#certificate").val())
  options.proxyMode = proxyModeItem.value
  setOptionsToLocal(options)
  message.success("Set successfully! Link to function page!")
  //autoJump()
})


async function changeModes(label) {
  proxyModeItem = modeList.find(profile => profile.label === label);
}

function initModes() {
  modeList.forEach(profile => {
    $(".proxy-list").append(`<option value="${profile.label}" >${profile.label}: ${profile.detail}</option>`);
  });
  proxyModeItem = modeList.find(profile => profile.value === options.proxyMode) || modeList[0];
  $(".proxy-list").val(proxyModeItem.label);
}

function initVersion() {
  const version = AgoraRTC.VERSION
  $("#version-text").text(`v${version}`)
}


function autoJump() {
  let href = localStorage.getItem("__setupJumpHref")
  if (href) {
    localStorage.removeItem("__setupJumpHref")
  } else {
    href = `${ORIGIN_URL}/example/basic/basicVoiceCall/index.html`
  }
  window.location.href = href
}

/*11.3 添加本地视频切换*/
document.addEventListener('DOMContentLoaded', function() {
    const toggleView = document.getElementById('toggle-view');
    const localPlayer = document.getElementById('local-player');
    const remotePlayerList = document.getElementById('remote-playerlist');

    // 设置初始状态
    if (toggleView.checked) {
        localPlayer.classList.remove('active');
        remotePlayerList.classList.add('active');
        //console.log('初始状态：远程视角');
    } else {
        localPlayer.classList.add('active');
        remotePlayerList.classList.remove('active');
       // console.log('初始状态：本地视角');
    }

    // 添加事件监听器
    toggleView.addEventListener('change', function() {
        if (toggleView.checked) {
            // 切换到远程视角
            localPlayer.classList.remove('active');
            remotePlayerList.classList.add('active');
           // console.log('切换到远程视角');
        } else {
            // 切换到本地视角
            localPlayer.classList.add('active');
            remotePlayerList.classList.remove('active');
            //console.log('切换到本地视角');
        }
    });
});


/////////////////////////////////////////////////////////////////////////////
// 定义Car结构体
class Car {
  constructor() {
      this.GasPedal = 0;
      this.SpeedLimit = 0;
      this.LSpeedReal = 0;
      this.RSpeedReal = 0;
      this.TurnSignalMode = 0;
      this.HeadLight = 0;
      this.RearLight = 0;
      this.Brake = 0;
      this.Direction = 127; // 127为零点
      this.ViewDirection = 127; // 127为零点
      this.Back = 0;
  }
}

// 初始化Car对象
let car = new Car();


///////////////////////////XboxCrtl//////////////////////////////////

// 创建一个空对象来存储连接的手柄
var gamepads = {};

// 监听手柄连接事件
window.addEventListener("gamepadconnected", function (e) {
  var gp = navigator.getGamepads()[e.gamepad.index];
  console.log(
    "控制器已连接于 %d 位：%s. %d 个按钮，%d 个坐标方向。",
    gp.index,
    gp.id,
    gp.buttons.length,
    gp.axes.length
  );
  gamepads[gp.index] = gp;
  requestAnimationFrame(updateGamepadStatus);
});

// 监听手柄断开事件
window.addEventListener("gamepaddisconnected", function (e) {
  console.log("控制器已从 %d 位断开：%s", e.gamepad.index, e.gamepad.id);
  delete gamepads[e.gamepad.index];
});

function updateGamepadStatus() {
  // 获取最新的手柄状态
  var updatedGamepads = navigator.getGamepads();
  for (var i in gamepads) {
      var gp = updatedGamepads[i];
      if (gp) {
          // 获取手柄输入
          var trigRT = gp.buttons[7].value; // 右扳机
          var trigLT = gp.buttons[6].value; // 左扳机
          var joyLHori = gp.axes[0]; // 左摇杆水平
          var joyRHori = gp.axes[2]; // 右摇杆水平

          // 按比例缩放并填充结构体数据
          car.GasPedal = Math.round(trigRT * 255); // 右扳机值缩放到0-255
          car.Brake = Math.round(trigLT * 255); // 左扳机值缩放到0-255
          car.Direction = Math.round((joyLHori + 1) * 127.5); // 左摇杆值缩放到0-255并消除负号
          car.ViewDirection = Math.round((joyRHori + 1) * 127.5); // 右摇杆值缩放到0-255并消除负号

          // 打印结构体数据（用于调试）
          //console.log(car);

          // 更新左摇杆轮盘位置
          var leftStick = document.getElementById("left-stick").querySelector(".stick-indicator");
          leftStick.style.transform = `translate(${joyLHori * 50}%, ${gp.axes[1] * 50}%) translate(-50%, -50%)`;
          // 更新右摇杆轮盘位置
          var rightStick = document.getElementById("right-stick").querySelector(".stick-indicator");
          rightStick.style.transform = `translate(${joyRHori * 50}%, ${gp.axes[3] * 50}%) translate(-50%, -50%)`;
      }
  }
  // 持续调用updateGamepadStatus
  requestAnimationFrame(updateGamepadStatus);
}


/////////////////////串口////////////////////////
document.addEventListener('DOMContentLoaded', () => {
  const baudRateInput = document.getElementById('baud-rate');
  const openPortButton = document.getElementById('open-port');
  const messageView = document.getElementById('message-view');
  const messageInput = document.getElementById('message-input');
  const sendMessageButton = document.getElementById('send-message');
  const clearMessagesButton = document.getElementById('clear-messages');

  let port;
  let reader;

  // 打开串口
  async function openPort() {
      const baudRate = parseInt(baudRateInput.value);
      if (isNaN(baudRate) || baudRate <= 0) {
          alert('bpsSET ERROR');
          return;
      }

      try {
          port = await navigator.serial.requestPort();
          await port.open({ baudRate });

          reader = port.readable.getReader();
          readData();
          openPortButton.textContent = 'Disconnect';
          openPortButton.classList.remove('btn-primary');
          openPortButton.classList.add('btn-danger');
          openPortButton.removeEventListener('click', openPort);
          openPortButton.addEventListener('click', closePort);
          messageInput.disabled = false;
          sendMessageButton.disabled = false;
          messageView.innerHTML = ''; // 清除消息视图
      } catch (error) {
          console.error('SerialportERROR:', error);
      }
  }

  // 关闭串口
  async function closePort() {
      if (reader) {
          reader.cancel();
          reader = null;
      }
      if (port) {
          await port.close();
          port = null;
      }
      openPortButton.textContent = '打开串口';
      openPortButton.classList.remove('btn-danger');
      openPortButton.classList.add('btn-primary');
      openPortButton.removeEventListener('click', closePort);
      openPortButton.addEventListener('click', openPort);
      messageInput.disabled = true;
      sendMessageButton.disabled = true;
  }

  // 读取数据
  async function readData() {
      try {
          const decoder = new TextDecoder();
          let buffer = '';
          while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              let lines = buffer.split('\n');
              buffer = lines.pop(); // 保留最后一个不完整的行
              lines.forEach(line => displayMessage(line));
          }
          if (buffer.length > 0) {
              displayMessage(buffer);
          }
      } catch (error) {
          console.error('读取数据失败:', error);
      }
  }

  // 显示消息
  function displayMessage(message) {
      const messageElement = document.createElement('div');
      messageElement.textContent = message;
      messageView.appendChild(messageElement);
      messageView.scrollTop = messageView.scrollHeight; // 自动滚动到底部
  }
  

  document.getElementById('numberForm').addEventListener('submit', function(event) {
    event.preventDefault(); // 阻止表单默认提交行为

    leftLimit = parseInt(document.getElementById('leftLimit').value);
    middle = parseInt(document.getElementById('middle').value);
    rightLimit = parseInt(document.getElementById('rightLimit').value);

    sendMessage(); // 在表单提交时调用 sendMessage 函数
});
// 发送消息
async function sendMessage() {
  if (!port || !port.writable) return;
  const writer = port.writable.getWriter();
    //调整转向偏移
    let leftLimit = document.getElementById('leftLimit').value;
    let middle = document.getElementById('middle').value;
    let rightLimit = document.getElementById('rightLimit').value;  
    let GasPedalLimit = document.getElementById('GasPedalLimit').value;
    if(car.GasPedal>GasPedalLimit)car.GasPedal=GasPedalLimit;
  let carDirection = car.Direction;
     if (car.Direction <= 127) {
    carDirection = Math.round(leftLimit-1 + (middle - leftLimit) * car.Direction / 127);
     } else {
    carDirection = Math.round(middle-1 + (rightLimit - middle) * (car.Direction - 127) / 127);
    }
  try {
      // 将Car结构体转换为字节数组
      let carData = new Uint8Array([
          car.GasPedal,
          car.SpeedLimit,
          car.LSpeedReal,
          car.RSpeedReal,
          car.TurnSignalMode,
          car.HeadLight,
          car.RearLight,
          car.Brake,
          carDirection,
          car.ViewDirection,
          car.Back
      ]);
       
      // 创建一个新的字节数组，包含$符号、carData和换行符
      let dataWithNewline = new Uint8Array(carData.length + 3);
      dataWithNewline[0] = '$'.charCodeAt(0); // 添加起始$
      dataWithNewline.set(carData, 1); // 添加carData
      dataWithNewline[carData.length + 1] = '$'.charCodeAt(0); // 添加结束$
      dataWithNewline[carData.length + 2] = '\n'.charCodeAt(0); // 添加换行符

      // 发送字节数组
      await writer.write(dataWithNewline);
      messageInput.value = '';
  } catch (error) {
      console.error('发送消息失败:', error);
  } finally {
      writer.releaseLock();
  }
}


// 每毫秒发送一次数据
setInterval(sendMessage, 5);

// 开始更新手柄状态
requestAnimationFrame(updateGamepadStatus);



  // 清除消息
  function clearMessages() {
      messageView.innerHTML = '';
  }

  // 绑定事件
  openPortButton.addEventListener('click', openPort);
  sendMessageButton.addEventListener('click', sendMessage);
  clearMessagesButton.addEventListener('click', clearMessages);

  // 初始化
  messageInput.disabled = true;
  sendMessageButton.disabled = true;
});


// 获取按钮元素
const buttonA = document.getElementById('buttonA');
const buttonB = document.getElementById('buttonB');
const buttonC = document.getElementById('buttonC');
const buttonD = document.getElementById('buttonD');
const buttonE = document.getElementById('buttonE');
const buttonF = document.getElementById('buttonF');
const buttonG = document.getElementById('buttonG');
const buttonH = document.getElementById('buttonH');

// 为每个按钮添加点击事件监听器
buttonA.addEventListener('click', () => { car.TurnSignalMode = 1; });
buttonB.addEventListener('click', () => { car.TurnSignalMode = 2; });
buttonC.addEventListener('click', () => { car.TurnSignalMode = 3; });
buttonD.addEventListener('click', () => { car.TurnSignalMode = 4; });
buttonE.addEventListener('click', () => { car.TurnSignalMode = 5; });
buttonF.addEventListener('click', () => { car.TurnSignalMode = 6; });
buttonG.addEventListener('click', () => { car.TurnSignalMode = 7; });
buttonH.addEventListener('click', () => { car.TurnSignalMode = 8; });


document.addEventListener('DOMContentLoaded', () => {
  // 获取按钮元素
  const buttonA = document.getElementById('buttonA');
  const buttonB = document.getElementById('buttonB');
  const buttonC = document.getElementById('buttonC');
  const buttonD = document.getElementById('buttonD');
  const buttonE = document.getElementById('buttonE');
  const buttonF = document.getElementById('buttonF');
  const buttonG = document.getElementById('buttonG');
  const buttonH = document.getElementById('buttonH');

  // 为每个按钮添加点击事件监听器
  buttonA.addEventListener('click', () => { car.TurnSignalMode = 0; });
  buttonB.addEventListener('click', () => { car.TurnSignalMode = 1; });
  buttonC.addEventListener('click', () => { car.TurnSignalMode = 2; });
  buttonD.addEventListener('click', () => { car.TurnSignalMode = 3; });
  buttonE.addEventListener('click', () => { car.TurnSignalMode = 4; });
  buttonF.addEventListener('click', () => { car.TurnSignalMode = 5; });
  buttonG.addEventListener('click', () => { car.TurnSignalMode = 6; });
  buttonH.addEventListener('click', () => { car.TurnSignalMode = 7; });
});
document.addEventListener('DOMContentLoaded', () => {
  // 获取按钮元素
  const buttonA = document.getElementById('buttonA');
  const buttonB = document.getElementById('buttonB');
  const buttonC = document.getElementById('buttonC');
  const buttonD = document.getElementById('buttonD');
  const buttonE = document.getElementById('buttonE');
  const buttonF = document.getElementById('buttonF');
  const buttonG = document.getElementById('buttonG');
  const buttonH = document.getElementById('buttonH');

  // 为每个按钮添加点击事件监听器
  buttonA.addEventListener('click', () => { car.TurnSignalMode = 0; });
  buttonB.addEventListener('click', () => { car.TurnSignalMode = 1; });
  buttonC.addEventListener('click', () => { car.TurnSignalMode = 2; });
  buttonD.addEventListener('click', () => { car.TurnSignalMode = 3; });
  buttonE.addEventListener('click', () => { car.TurnSignalMode = 4; });
  buttonF.addEventListener('click', () => { car.TurnSignalMode = 5; });
  buttonG.addEventListener('click', () => { car.TurnSignalMode = 6; });
  buttonH.addEventListener('click', () => { car.TurnSignalMode = 7; });

  // 获取进度条元素
  const headlightSlider = document.getElementById('headlight-slider');
  const rearlightSlider = document.getElementById('rearlight-slider');
  const headlightValue = document.getElementById('headlight-value');
  const rearlightValue = document.getElementById('rearlight-value');

  // 为HeadLight进度条添加事件监听器
  headlightSlider.addEventListener('input', () => {
      car.HeadLight = parseInt(headlightSlider.value);
      headlightValue.textContent = headlightSlider.value;
  });

  // 为RearLight进度条添加事件监听器
  rearlightSlider.addEventListener('input', () => {
      car.RearLight = parseInt(rearlightSlider.value);
      rearlightValue.textContent = rearlightSlider.value;
  });
});
