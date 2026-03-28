from collections import namedtuple
from PyQt6.QtCore import QTimer
from PyQt6.QtWidgets import QGridLayout, QHBoxLayout, QLineEdit, QMainWindow
from PyQt6.QtWidgets import QDialog
from PyQt6.QtWidgets import QWidget,QGroupBox
from PyQt6.QtWidgets import QMessageBox,QVBoxLayout,QCheckBox,QButtonGroup,QPushButton,QLabel,QSpinBox,QComboBox
from PyQt6 import uic
import helper
from optionsdialog import OptionsDialog,OptionsDialogGroupBox
from helper import res_path,classlistToIds
from base_ui import CommunicationHandler
import portconf_ui

class ButtonOptionsDialog(OptionsDialog):
    def __init__(self,name,id, main):
        self.main = main
        self.dialog = OptionsDialogGroupBox(name,main)

        if(id == 0): # local buttons
            self.dialog = (LocalButtonsConf(name,self.main))
        elif(id == 1):
            self.dialog = (SPIButtonsConf(name,self.main,0))
        elif(id == 2):
            self.dialog = (SPIButtonsConf(name,self.main,1))
        elif(id == 3):
            self.dialog = (ShifterButtonsConf(name,self.main))
        elif(id == 4):
            self.dialog = (PCFButtonsConf(name,self.main))
        elif(id == 5):
            self.dialog = (CANButtonsConf(name,self.main))
        
        OptionsDialog.__init__(self, self.dialog,main)


class LocalButtonsConf(OptionsDialogGroupBox,CommunicationHandler):

    def __init__(self,name,main):
        self.main = main
        OptionsDialogGroupBox.__init__(self,name,main)
        CommunicationHandler.__init__(self)
        self.buttonBox = QGroupBox("Pins")
        self.buttonBoxLayout = QGridLayout()
        self.buttonBox.setLayout(self.buttonBoxLayout)

        self.btn_mask=0
        self.momentary_mask=0
        self.num = 0
        self.visible_num = 0
        self.matrix_rows = 1
        self.matrix_cols = 1
        self.syncing_mode = False
        self.has_mode_cmd = False
        self.prefix=0
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.updateTimer)

    def initUI(self):
        vbox = QVBoxLayout()
        self.polBox = QCheckBox("Invert")
        vbox.addWidget(self.polBox)

        matrixLayout = QHBoxLayout()
        self.matrixViewBox = QCheckBox("Matrix view")
        self.matrixViewBox.toggled.connect(self.matrixModeChanged)
        matrixLayout.addWidget(self.matrixViewBox)
        matrixLayout.addWidget(QLabel("Rows"))
        self.rowsBox = QSpinBox()
        self.rowsBox.setMinimum(1)
        self.rowsBox.setMaximum(64)
        self.rowsBox.valueChanged.connect(self.matrixLayoutChanged)
        matrixLayout.addWidget(self.rowsBox)
        matrixLayout.addWidget(QLabel("Cols"))
        self.colsBox = QSpinBox()
        self.colsBox.setMinimum(1)
        self.colsBox.setMaximum(64)
        self.colsBox.valueChanged.connect(self.matrixLayoutChanged)
        matrixLayout.addWidget(self.colsBox)
        vbox.addLayout(matrixLayout)

        self.layoutInfo = QLabel("Layout only affects how buttons are shown in configurator.")
        self.layoutInfo.setWordWrap(True)
        vbox.addWidget(self.layoutInfo)

        self.buttongroup = QButtonGroup()
        self.buttongroup.setExclusive(False)
        self.buttongroup_momentary = QButtonGroup()
        self.buttongroup_momentary.setExclusive(False)
        vbox.addWidget(self.buttonBox)
        
        self.setLayout(vbox)

    def guessMatrixLayout(self, num):
        if num <= 1:
            return (1, max(1, num))

        best_rows = 1
        best_cols = num
        best_delta = best_cols - best_rows

        limit = int(num ** 0.5)
        for rows in range(1, limit + 1):
            if num % rows == 0:
                cols = num // rows
                delta = abs(cols - rows)
                if delta < best_delta:
                    best_rows = rows
                    best_cols = cols
                    best_delta = delta

        if best_rows == 1 and num > 8:
            best_rows = int(num ** 0.5)
            best_cols = (num + best_rows - 1) // best_rows

        return (best_rows, best_cols)

    def clearButtons(self):
        while self.buttonBoxLayout.count():
            item = self.buttonBoxLayout.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.setParent(None)

        for b in self.buttongroup.buttons():
            self.buttongroup.removeButton(b)

        for b in self.buttongroup_momentary.buttons():
            self.buttongroup_momentary.removeButton(b)

    def getVisibleNum(self):
        if self.matrixViewBox.isChecked():
            return max(1, self.rowsBox.value() * self.colsBox.value())
        return max(0, self.num)

    def updateLayoutInfo(self):
        msg = f"Firmware buttons: {self.num}. Layout slots shown: {self.visible_num}."
        if self.visible_num < self.num:
            msg += " Hidden firmware buttons keep their previous values on Apply."
        if not self.has_mode_cmd:
            msg += " Firmware without dpin.mode: Matrix view changes only the UI layout."
        self.layoutInfo.setText(msg)

    def loadLayoutSettings(self):
        default_rows, default_cols = self.guessMatrixLayout(self.num)

        profile_ui = getattr(self.main, "profile_ui", None)
        if profile_ui is None:
            return (default_rows, default_cols)

        rows = profile_ui.get_global_setting("dpin_matrix_rows", default_rows)
        cols = profile_ui.get_global_setting("dpin_matrix_cols", default_cols)

        try:
            rows = int(rows)
        except (TypeError, ValueError):
            rows = default_rows
        try:
            cols = int(cols)
        except (TypeError, ValueError):
            cols = default_cols
        rows = max(1, min(64, rows))
        cols = max(1, min(64, cols))

        return (rows, cols)

    def saveLayoutSettings(self):
        profile_ui = getattr(self.main, "profile_ui", None)
        if profile_ui is None:
            return

        profile_ui.set_global_setting("dpin_matrix_rows", int(self.rowsBox.value()), save=False)
        profile_ui.set_global_setting("dpin_matrix_cols", int(self.colsBox.value()), save=True)

    def applyMasksToUi(self):
        for i in range(self.visible_num):
            btn = self.buttongroup.button(i)
            if btn is not None:
                btn.setChecked((self.btn_mask & (1 << i)) != 0)

            btn_mom = self.buttongroup_momentary.button(i)
            if btn_mom is not None:
                btn_mom.setChecked((self.momentary_mask & (1 << i)) != 0)

    def createLinearButtons(self):
        self.buttonBoxLayout.addWidget(QLabel("Pins"),0,0)
        self.buttonBoxLayout.addWidget(QLabel("Pulse mode"),0,1)
        for i in range(self.visible_num):
            cb = QCheckBox(str(i+1))
            self.buttongroup.addButton(cb,i)

            cb_mom = QCheckBox(str(i+1))
            self.buttongroup_momentary.addButton(cb_mom,i)

            self.buttonBoxLayout.addWidget(cb,i+1,0)
            self.buttonBoxLayout.addWidget(cb_mom,i+1,1)

    def createMatrixButtons(self):
        self.buttonBoxLayout.addWidget(QLabel("Enabled"), 0, 1, 1, self.matrix_cols)
        self.buttonBoxLayout.addWidget(QLabel("Pulse mode"), 0, self.matrix_cols + 2, 1, self.matrix_cols)

        for row in range(self.matrix_rows):
            self.buttonBoxLayout.addWidget(QLabel(f"R{row + 1}"), row + 1, 0)
            self.buttonBoxLayout.addWidget(QLabel(f"R{row + 1}"), row + 1, self.matrix_cols + 1)
            for col in range(self.matrix_cols):
                idx = row * self.matrix_cols + col
                if idx >= self.visible_num:
                    continue

                cb = QCheckBox(str(idx + 1))
                self.buttongroup.addButton(cb, idx)
                self.buttonBoxLayout.addWidget(cb, row + 1, col + 1)

                cb_mom = QCheckBox(str(idx + 1))
                self.buttongroup_momentary.addButton(cb_mom, idx)
                self.buttonBoxLayout.addWidget(cb_mom, row + 1, self.matrix_cols + 2 + col)

    def rebuildButtons(self):
        self.clearButtons()
        self.visible_num = self.getVisibleNum()
        if not self.matrixViewBox.isChecked():
            # In direct mode always mirror the exact firmware pin count.
            self.visible_num = max(0, self.num)

        if self.matrixViewBox.isChecked() and self.visible_num > 1:
            self.createMatrixButtons()
        else:
            self.createLinearButtons()

        self.applyMasksToUi()
        self.updateLayoutInfo()
        self.buttonBox.update()

    def matrixLayoutChanged(self, _=None):
        self.rowsBox.setEnabled(self.matrixViewBox.isChecked())
        self.colsBox.setEnabled(self.matrixViewBox.isChecked())

        if self.num <= 0:
            return

        self.matrix_rows = self.rowsBox.value()
        self.matrix_cols = self.colsBox.value()
        self.rebuildButtons()

    def modeCb(self, mode):
        self.has_mode_cmd = True
        mode_enabled = bool(int(mode))
        self.syncing_mode = True
        self.matrixViewBox.blockSignals(True)
        self.matrixViewBox.setChecked(mode_enabled)
        self.matrixViewBox.blockSignals(False)
        self.syncing_mode = False
        self.matrixLayoutChanged()
        self.updateLayoutInfo()

    def matrixModeChanged(self, checked):
        self.matrixLayoutChanged()
        if self.syncing_mode:
            return

        # Only send dpin.mode when the firmware supports it.
        if self.has_mode_cmd:
            self.send_value("dpin","mode",1 if checked else 0)
            self.get_value_async("dpin","pins",self.initButtons,0,conversion=int)

    # Tab is currently shown
    def showEvent(self,event):
        self.timer.start(300)

    # Tab is hidden
    def hideEvent(self,event):
        self.timer.stop()
        
    def updateTimer(self):
        self.send_commands("dpin",["values"],self.prefix)

    def onclose(self):
        self.remove_callbacks()

    def onshown(self):
        self.register_callback("dpin","values",self.valueCb,self.prefix,int)

    def valueCb(self, val):
        j=0
        for i in range(self.visible_num):
            btn = self.buttongroup.button(i)
            if btn is None:
                continue
            if self.btn_mask & (1<<i):
                if val & (1<<j):
                    btn.setStyleSheet("background-color: yellow")
                else:
                    btn.setStyleSheet("background-color: none")
                j=j+1
            else:
                btn.setStyleSheet("background-color: none")
            
    def initButtons(self,num):
        self.num = num
        self.matrix_rows, self.matrix_cols = self.loadLayoutSettings()

        self.rowsBox.blockSignals(True)
        self.colsBox.blockSignals(True)
        self.rowsBox.setValue(self.matrix_rows)
        self.colsBox.setValue(self.matrix_cols)
        self.rowsBox.blockSignals(False)
        self.colsBox.blockSignals(False)

        self.matrixLayoutChanged()

        def localcb(mask):
            self.btn_mask = mask
            self.applyMasksToUi()
                
        def localpulsemaskcb(mask):
            self.momentary_mask = mask
            self.applyMasksToUi()

        self.get_value_async("dpin","mask",localcb,0,conversion=int)
        self.get_value_async("dpin","pulse",localpulsemaskcb,0,conversion=int)
        
 
    def apply(self):
        new_btn_mask = int(self.btn_mask)
        new_momentary_mask = int(self.momentary_mask)

        loop_count = self.visible_num if self.matrixViewBox.isChecked() else max(0, self.num)
        for i in range(loop_count):
            btn = self.buttongroup.button(i)
            if btn is not None and btn.isChecked():
                new_btn_mask |= 1 << i
            else:
                new_btn_mask &= ~(1 << i)

            btn_mom = self.buttongroup_momentary.button(i)
            if btn_mom is not None and btn_mom.isChecked():
                new_momentary_mask |= 1 << i
            else:
                new_momentary_mask &= ~(1 << i)

        self.btn_mask = new_btn_mask
        self.momentary_mask = new_momentary_mask

        if self.has_mode_cmd:
            self.send_value("dpin","mode",(1 if self.matrixViewBox.isChecked() else 0))
        self.send_value("dpin","mask",self.btn_mask)
        self.send_value("dpin","pulse",self.momentary_mask)
        self.send_value("dpin","polarity",(1 if self.polBox.isChecked() else 0))
        self.saveLayoutSettings()
    
    def readValues(self):
        self.has_mode_cmd = False
        self.get_value_async("dpin","pins",self.initButtons,0,conversion=int)
        self.get_value_async("dpin","mode",self.modeCb,0,conversion=int)
        self.get_value_async("dpin","polarity",self.polBox.setChecked,0,conversion=int)
        self.updateLayoutInfo()
 

class SPIButtonsConf(OptionsDialogGroupBox,CommunicationHandler):

    def __init__(self,name,main,id):
        self.main = main
        self.id = id
        OptionsDialogGroupBox.__init__(self,name,main)
        CommunicationHandler.__init__(self)

   
    def initUI(self):
        vbox = QVBoxLayout()
        vbox.addWidget(QLabel("Buttons"))
        self.numBtnBox = QSpinBox()
        self.numBtnBox.setMinimum(0)
        self.numBtnBox.setMaximum(64)
        vbox.addWidget(self.numBtnBox)

        vbox.addWidget(QLabel("SPI Speed"))
        self.speedBox = QComboBox()
        vbox.addWidget(self.speedBox)

        vbox.addWidget(QLabel("Mode"))
        self.modeBox = QComboBox()
        vbox.addWidget(self.modeBox)

        self.polBox = QCheckBox("Invert")
        vbox.addWidget(self.polBox)
        self.setLayout(vbox)

        vbox.addWidget(QLabel("CS #"))
        self.csBox = QSpinBox()
        self.csBox.setMinimum(1)
        self.csBox.setMaximum(3)
        vbox.addWidget(self.csBox)

    def apply(self):
        self.send_value("spibtn","mode",self.modeBox.currentData(),instance=self.id)
        self.send_value("spibtn","btnnum",self.numBtnBox.value(),instance=self.id)
        self.send_value("spibtn","btnpol",1 if self.polBox.isChecked() else 0,instance=self.id)
        self.send_value("spibtn","cs",self.csBox.value(),instance=self.id)
        self.send_value("spibtn","spispeed",self.speedBox.currentData(),instance=self.id)

    def onclose(self):
        self.remove_callbacks()

     
    def readValues(self):

        self.modeBox.clear()
        def modecb(mode):
            modes = helper.splitListReply(mode)
            for m in modes:
                self.modeBox.addItem(m[0],m[1])
            self.get_value_async("spibtn","mode",self.modeBox.setCurrentIndex,self.id,conversion=int)

        self.speedBox.clear()
        def speedcb(mode):
            modes = helper.splitListReply(mode)
            for m in modes:
                self.speedBox.addItem(m[0],m[1])
            self.get_value_async("spibtn","spispeed",self.speedBox.setCurrentIndex,self.id,conversion=int)
            
        self.get_value_async("spibtn","btnnum",self.numBtnBox.setValue,self.id,conversion=int)
        self.get_value_async("spibtn","mode",modecb,self.id,conversion=str,typechar='!')
        self.get_value_async("spibtn","spispeed",speedcb,self.id,conversion=str,typechar='!')
        self.get_value_async("spibtn","btnpol",self.polBox.setChecked,self.id,conversion=int)
        self.get_value_async("spibtn","cs",self.csBox.setValue,self.id,conversion=int)


class ShifterButtonsConf(OptionsDialogGroupBox,CommunicationHandler):
    class Mode(namedtuple('Mode', ['index', 'name', 'uses_spi', 'uses_local_reverse'])):
        pass

    def __init__(self,name,main):
        self.main = main
        OptionsDialogGroupBox.__init__(self,name,main)
        CommunicationHandler.__init__(self)
   
    def initUI(self):
        def addThreshold(name):
            vbox.addWidget(QLabel(name))
            numBtnBox = QSpinBox()
            numBtnBox.setMinimum(0)
            numBtnBox.setMaximum(0xffff)
            vbox.addWidget(numBtnBox)
            return numBtnBox

        vbox = QVBoxLayout()
        vbox.addWidget(QLabel("Mode"))
        self.modeBox = QComboBox()
        self.modeBox.currentIndexChanged.connect(self.modeBoxChanged)
        vbox.addWidget(self.modeBox)

        self.xPos = QLineEdit()
        self.xPos.setReadOnly(True)
        self.yPos = QLineEdit()
        self.yPos.setReadOnly(True)
        self.gear = QLineEdit()
        self.gear.setReadOnly(True)

        posGroup = QGridLayout()
        posGroup.addWidget(QLabel("X"), 1, 1)
        posGroup.addWidget(self.xPos, 1, 2)
        posGroup.addWidget(QLabel("Y"), 1, 3)
        posGroup.addWidget(self.yPos, 1, 4)
        posGroup.addWidget(QLabel("Calculated Gear"), 2, 1, 1, 2)
        posGroup.addWidget(self.gear, 2, 3, 1, 2)
        posGroupBox = QGroupBox()
        posGroupBox.setTitle("Current")
        posGroupBox.setLayout(posGroup)
        vbox.addWidget(posGroupBox)

        vbox.addWidget(QLabel("X Channel"))
        self.xChannel = QSpinBox()
        self.xChannel.setMinimum(1)
        self.xChannel.setMaximum(6)
        vbox.addWidget(self.xChannel)

        vbox.addWidget(QLabel("Y Channel"))
        self.yChannel = QSpinBox()
        self.yChannel.setMinimum(1)
        self.yChannel.setMaximum(6)
        vbox.addWidget(self.yChannel)

        self.x12 = addThreshold("X 1,2 Threshold")
        self.x56 = addThreshold("X 5,6 Threshold")
        self.y135 = addThreshold("Y 1,3,5 Threshold")
        self.y246 = addThreshold("Y 2,4,6 Threshold")

        self.revBtnLabel = QLabel("Reverse Button Digital Input")
        vbox.addWidget(self.revBtnLabel)
        self.revBtnBox = QSpinBox()
        self.revBtnBox.setMinimum(1)
        self.revBtnBox.setMaximum(8)
        vbox.addWidget(self.revBtnBox)

        self.csPinLabel = QLabel("SPI CS Pin Number")
        vbox.addWidget(self.csPinLabel)
        self.csPinBox = QSpinBox()
        self.csPinBox.setMinimum(1)
        self.csPinBox.setMaximum(3)
        vbox.addWidget(self.csPinBox)

        self.setLayout(vbox)

        self.timer = QTimer()
        self.timer.timeout.connect(self.readXYPosition)

    def onshown(self):
        self.timer.start(500)

    def onclose(self):
        self.timer.stop()
        self.remove_callbacks()

    def modeBoxChanged(self, _):
        mode = self.modeBox.currentData()

        if mode is not None:
            self.revBtnLabel.setVisible(mode.uses_local_reverse)
            self.revBtnBox.setVisible(mode.uses_local_reverse)
            self.csPinLabel.setVisible(mode.uses_spi)
            self.csPinBox.setVisible(mode.uses_spi)
 
    def apply(self):
        self.send_value("shifter","mode",self.modeBox.currentData().index)
        self.send_value("shifter","xchan",self.xChannel.value())
        self.send_value("shifter","ychan",self.yChannel.value())
        self.send_value("shifter","x12",self.x12.value())
        self.send_value("shifter","x56",self.x56.value())
        self.send_value("shifter","y135",self.y135.value())
        self.send_value("shifter","y246",self.y246.value())
        self.send_value("shifter","revbtn",self.revBtnBox.value())
        self.send_value("shifter","cspin",self.csPinBox.value())

    def readXYPosition(self):
        def updatePosition(valueStr: str):
            x,y = valueStr.strip().split(":")
            self.xPos.setText(x)
            self.yPos.setText(y)

        def updateGear(value: str):
            value = value.strip()
            if value == "0":
                value = "N"
            elif value == "7":
                value = "R"
            
            self.gear.setText(value)
        self.get_value_async("shifter","vals",updatePosition,0,conversion=str)
        self.get_value_async("shifter","gear",updateGear,0,conversion=str)  

    def readValues(self):
        self.modeBox.clear()
        def modecb(mode):
            modes = mode.split("\n")
            modes = [m.split(":") for m in modes if m]
            for m in modes:
                index, uses_spi, uses_local_reverse = m[1].split(',')
                self.modeBox.addItem(m[0], ShifterButtonsConf.Mode(int(index), m[0], uses_spi == "1", uses_local_reverse == "1"))
            self.get_value_async("shifter","mode",self.modeBox.setCurrentIndex,0,conversion=int)
        self.get_value_async("shifter","mode",modecb,0,conversion=str,typechar = '!')
        self.get_value_async("shifter","xchan",self.xChannel.setValue,0,conversion=int)
        self.get_value_async("shifter","ychan",self.yChannel.setValue,0,conversion=int)

        self.get_value_async("shifter","x12",self.x12.setValue,0,conversion=int)
        self.get_value_async("shifter","x56",self.x56.setValue,0,conversion=int)
        self.get_value_async("shifter","y135",self.y135.setValue,0,conversion=int)
        self.get_value_async("shifter","y246",self.y246.setValue,0,conversion=int)

        self.get_value_async("shifter","revbtn",self.revBtnBox.setValue,0,conversion=int)
        self.get_value_async("shifter","cspin",self.csPinBox.setValue,0,conversion=int)

        self.readXYPosition()


class CANButtonsConf(OptionsDialogGroupBox,CommunicationHandler):

    def __init__(self,name,main):
        self.main = main
        OptionsDialogGroupBox.__init__(self,name,main)
        CommunicationHandler.__init__(self)


    def initUI(self):
        vbox = QVBoxLayout()
        self.polBox = QCheckBox("Invert")
        vbox.addWidget(self.polBox)
        self.polBox.stateChanged.connect(self.amountChanged)

        self.numBtnBox = QSpinBox()
        self.numBtnBox.setMinimum(1)
        self.numBtnBox.setMaximum(64)
        vbox.addWidget(QLabel("Number of buttons"))
        vbox.addWidget(self.numBtnBox)
        self.numBtnBox.valueChanged.connect(self.amountChanged)

        self.canIdBox = QSpinBox()
        self.canIdBox.setMinimum(1)
        self.canIdBox.setMaximum(0x7ff)
        vbox.addWidget(QLabel("CAN frame ID"))
        vbox.addWidget(self.canIdBox)
        self.canIdBox.valueChanged.connect(self.amountChanged)

        self.infoLabel = QLabel("")
        vbox.addWidget(self.infoLabel)
        self.cansettingsbutton = QPushButton("CAN settings")
        self.canOptions = portconf_ui.CanOptionsDialog(0,"CAN",self.main)
        self.cansettingsbutton.clicked.connect(self.canOptions.exec)
        vbox.addWidget(self.cansettingsbutton)
        
        self.setLayout(vbox)

    def amountChanged(self,_):
        amount = self.numBtnBox.value()
        text = ""
        text += f"ID {self.canIdBox.value()}:\n"
        polchar = "0" if self.polBox.isChecked() else "1"
        for value in range(64):
            if value < amount:
                text += polchar
            else:
                text += "x"
            if value < 63:
                if (value+1) % 8 == 0:
                    text += "|"
                if (value+1) % 32 == 0:
                    text += "\n"
                



        self.infoLabel.setText(text)

    def onclose(self):
        self.remove_callbacks()

    def apply(self):
        self.send_value("canbtn","canid",self.canIdBox.value())
        self.send_value("canbtn","btnnum",self.numBtnBox.value())
        self.send_value("canbtn","invert",(1 if self.polBox.isChecked() else 0))
    
    def readValues(self):
        self.get_value_async("canbtn","btnnum",self.numBtnBox.setValue,0,conversion=int)
        self.get_value_async("canbtn","invert",self.polBox.setChecked,0,conversion=int)
        self.get_value_async("canbtn","canid",self.canIdBox.setValue,0,conversion=int)
 
class PCFButtonsConf(OptionsDialogGroupBox,CommunicationHandler):

    def __init__(self,name,main):
        self.main = main
        OptionsDialogGroupBox.__init__(self,name,main)
        CommunicationHandler.__init__(self)


    def initUI(self):
        vbox = QVBoxLayout()
        self.polBox = QCheckBox("Invert")
        vbox.addWidget(self.polBox)
        self.fastBox = QCheckBox("400kHz fast mode")
        vbox.addWidget(self.fastBox)
        vbox.addWidget(QLabel("Requires num/8 PCF8574 w. increasing addresses.\nNumber of buttons:"))
        self.numBtnBox = QSpinBox()
        self.numBtnBox.setMinimum(1)
        self.numBtnBox.setMaximum(64)
        vbox.addWidget(self.numBtnBox)
        
        self.setLayout(vbox)

    def onclose(self):
        self.remove_callbacks()

    def apply(self):

        self.send_value("pcfbtn","btnnum",self.numBtnBox.value())
        self.send_value("pcfbtn","invert",(1 if self.polBox.isChecked() else 0))
        self.send_value("i2c","speed",(1 if self.fastBox.isChecked() else 0))
    
    def readValues(self):
        self.get_value_async("pcfbtn","btnnum",self.numBtnBox.setValue,0,conversion=int)
        self.get_value_async("pcfbtn","invert",self.polBox.setChecked,0,conversion=int)
        self.get_value_async("i2c","speed",self.fastBox.setChecked,0,conversion=int)
 
